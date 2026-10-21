#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedTools = [
  "elearn_list_events",
  "elearn_list_announcements",
  "elearn_preview_downloads",
  "elearn_confirm_downloads",
  "elearn_open_course_browser",
  "elearn_browse_course",
  "elearn_download_documents",
  "elearn_authenticate",
  "elearn_auth_status",
  "elearn_list_courses",
  "elearn_list_pinned_courses",
  "elearn_list_course_weeks",
  "elearn_get_week_documents",
  "elearn_get_recent_documents",
  "elearn_get_course_documents",
  "elearn_search_content",
  "elearn_get_document_metadata",
  "elearn_download_document",
];

const client = new Client({ name: "smu-elearn-full-run", version: "1.0.0" });
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "elearn-mcp-full-run-"));
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/src/server.js"],
  stderr: "pipe",
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)), ELEARN_DOWNLOAD_DIR: temporaryDirectory },
});
const timings = [];

async function call(name, args = {}) {
  const started = performance.now();
  const result = await client.callTool({ name, arguments: args });
  timings.push({ tool: name, milliseconds: Math.round(performance.now() - started) });
  if (result.isError) {
    const message = result.content?.find((item) => item.type === "text")?.text ?? "Unknown MCP tool error";
    throw new Error(`${name} failed: ${message}`);
  }
  assert.ok(result.structuredContent, `${name} did not return structuredContent`);
  return result.structuredContent;
}

try {
  await client.connect(transport);

  const toolList = await client.listTools();
  const names = toolList.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [...expectedTools].sort(), "MCP tool list did not match the expected contract");

  const interactiveAuth = await call("elearn_authenticate", {
    initialWaitSeconds: 1,
    pollIntervalSeconds: 1,
    timeoutSeconds: 30,
  });
  assert.equal(interactiveAuth.authenticated, true, "Interactive browser authentication did not succeed");

  const auth = await call("elearn_auth_status");
  assert.equal(auth.authenticated, true, "Saved eLearn session was not authenticated");

  for (const tool of ["elearn_list_events", "elearn_list_announcements"]) {
    const result = await call(tool, { maxCourses: 3 });
    const items = tool === "elearn_list_events" ? result.events : result.announcements;
    assert.equal(result.count, items.length);
    assert.equal(result.failures.length, 0, `${tool} returned course failures`);
  }

  const courseResult = await call("elearn_list_courses", { activeOnly: true, limit: 200 });
  assert.ok(courseResult.count > 0, "No active eLearn courses were returned");
  assert.equal(courseResult.count, courseResult.courses.length);

  const pinnedResult = await call("elearn_list_pinned_courses", { limit: 200 });
  assert.ok(pinnedResult.count > 0, "No pinned courses were returned");
  assert.ok(pinnedResult.courses.every((course) => course.isPinned), "Pinned tool returned an unpinned course");

  const selectedCourse =
    pinnedResult.courses.find((course) => /Merged Section/i.test(course.name)) ??
    pinnedResult.courses[0] ??
    courseResult.courses[0];
  assert.ok(selectedCourse, "Could not select a course for content tests");
  const browserLaunch = await call("elearn_open_course_browser");
  assert.ok(browserLaunch.courses.some((course) => course.id === selectedCourse.id));
  const browserData = await call("elearn_browse_course", { courseId: selectedCourse.id });
  assert.ok(Array.isArray(browserData.weeks) && Array.isArray(browserData.documents));

  const weekResult = await call("elearn_list_course_weeks", { courseId: selectedCourse.id });
  assert.ok(weekResult.count > 0, `No weekly modules found in ${selectedCourse.name}`);
  const selectedWeek = weekResult.weeks.find((week) => week.documentCount > 0) ?? weekResult.weeks[0];
  assert.ok(selectedWeek, "Could not select a weekly module");

  const weekDocuments = await call("elearn_get_week_documents", {
    courseId: selectedCourse.id,
    week: selectedWeek.weekNumber ?? selectedWeek.title,
  });
  assert.ok(weekDocuments.count > 0, `No documents found for ${selectedWeek.title}`);

  const courseDocuments = await call("elearn_get_course_documents", {
    courseId: selectedCourse.id,
  });
  assert.ok(courseDocuments.count >= weekDocuments.count, "Course document count was smaller than week count");

  const documentWithDate =
    weekDocuments.documents.find((document) => document.lastModifiedDate) ??
    courseDocuments.documents.find((document) => document.lastModifiedDate);
  assert.ok(documentWithDate?.lastModifiedDate, "No document exposed LastModifiedDate for recent-document testing");
  const modifiedAt = new Date(documentWithDate.lastModifiedDate);
  const recentDocuments = await call("elearn_get_recent_documents", {
    scope: "pinned",
    courseIds: [selectedCourse.id],
    since: new Date(modifiedAt.getTime() - 60_000).toISOString(),
    until: new Date(modifiedAt.getTime() + 60_000).toISOString(),
    maxCourses: 1,
  });
  assert.ok(
    recentDocuments.documents.some((document) => document.topicId === documentWithDate.topicId),
    "Recent-document filtering did not return the known document in its modification window",
  );

  const currentWeekDocuments = await call("elearn_get_recent_documents", {
    scope: "pinned",
    maxCourses: 10,
  });
  assert.ok(Array.isArray(currentWeekDocuments.documents), "Current-week query did not return a document array");

  const searchTarget = weekDocuments.documents[0];
  assert.ok(searchTarget, "No document was available for search testing");
  const searchQuery = searchTarget.title.slice(0, 80);
  const searchResult = await call("elearn_search_content", {
    query: searchQuery,
    courseIds: [selectedCourse.id],
    maxCourses: 1,
    limit: 20,
  });
  assert.ok(
    searchResult.documents.some((document) => document.topicId === searchTarget.topicId),
    "Content search did not return the document used to form the query",
  );

  const metadataResult = await call("elearn_get_document_metadata", {
    courseId: selectedCourse.id,
    topicId: searchTarget.topicId,
  });
  assert.equal(metadataResult.document.Id, searchTarget.topicId, "Metadata topic ID did not match");
  assert.equal(metadataResult.document.Type, 1, "Metadata object was not a topic");

  const downloadResult = await call("elearn_download_document", {
    courseId: selectedCourse.id,
    topicId: searchTarget.topicId,
    destinationDir: temporaryDirectory,
  });
  const downloaded = downloadResult.download;
  const downloadedStat = await fs.stat(downloaded.path);
  assert.ok(downloadedStat.isFile(), "Download output was not a file");
  assert.ok(downloadedStat.size > 0, "Downloaded file was empty");
  assert.equal(downloadedStat.size, downloaded.bytes, "Reported and on-disk download sizes differed");
  assert.equal(path.dirname(downloaded.path), temporaryDirectory, "Download escaped the isolated directory");
  const batch = await call("elearn_download_documents", { documents: [
    { courseId: selectedCourse.id, topicId: searchTarget.topicId },
    { courseId: selectedCourse.id, topicId: searchTarget.topicId },
  ] });
  assert.equal(batch.succeeded, 1, "Batch should download a duplicate selection only once");
  assert.equal(batch.failed, 0);
  const batchFile = batch.results[0].download;
  assert.notEqual(batchFile.path, downloaded.path, "Batch must not overwrite an existing file");
  assert.equal(path.dirname(batchFile.path), temporaryDirectory);
  assert.equal((await fs.stat(batchFile.path)).size, batchFile.bytes);

  const storageStatePath =
    process.env.ELEARN_AUTH_STATE_FILE ?? path.join(os.homedir(), ".elearn-mcp", "storage-state.json");
  const stateStat = await fs.stat(storageStatePath);
  assert.equal(stateStat.mode & 0o777, 0o600, "Saved authentication state was not mode 0600");

  console.log(
    JSON.stringify(
      {
        passed: true,
        assertions: {
          mcpHandshake: true,
          registeredTools: names.length,
          interactiveBrowserAuthentication: true,
          authenticatedAfterRestart: true,
          activeCourses: courseResult.count,
          pinnedCourses: pinnedResult.count,
          selectedCourse: {
            id: selectedCourse.id,
            name: selectedCourse.name,
            code: selectedCourse.code,
          },
          discoveredWeeks: weekResult.count,
          selectedWeek: selectedWeek.title,
          selectedWeekDocuments: weekDocuments.count,
          allCourseDocuments: courseDocuments.count,
          recentWindowDocuments: recentDocuments.count,
          currentWeekDocuments: currentWeekDocuments.count,
          searchResults: searchResult.count,
          metadataTopicId: metadataResult.document.Id,
          downloadedBytes: downloaded.bytes,
          downloadedContentType: downloaded.contentType,
          authStateMode: "0600",
          temporaryDownloadCleaned: true,
        },
        timings,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close().catch(() => undefined);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
