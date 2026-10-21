#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
].sort();
const pluginServers = [
  {
    client: "Codex",
    path: path.join(projectRoot, "plugin-package", "codex", "smu-elearn", "mcp", "dist", "src", "server.js"),
  },
];

for (const pluginServer of pluginServers) {
  const client = new Client({
    name: `${pluginServer.client.toLowerCase()}-plugin-smoke-test`,
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [pluginServer.path],
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const toolList = await client.listTools();
    const names = toolList.tools.map((tool) => tool.name).sort();
    assert.deepEqual(
      names,
      expectedTools,
      `${pluginServer.client} plugin tool list did not match the expected contract`,
    );
    const auth = toolList.tools.find((tool) => tool.name === "elearn_authenticate");
    assert.deepEqual(auth.inputSchema.properties.browser.enum, ["edge", "chrome"]);
    assert.ok(!auth.inputSchema.required?.includes("browser"), "Browser choice must remain optional");
    const opener = toolList.tools.find((tool) => tool.name === "elearn_open_course_browser");
    assert.equal(opener._meta.ui.resourceUri, "ui://smu-elearn/course-browser");
    assert.deepEqual(opener._meta["openai/ui"].entrypoints, [{ type: "global" }, { type: "thread" }]);
    const resource = await client.readResource({ uri: opener._meta.ui.resourceUri });
    assert.match(resource.contents[0].mimeType, /text\/html/);
    assert.match(resource.contents[0].text, /Download selected/);
    assert.ok(!resource.contents[0].text.includes("/* APP_SCRIPT */"), "UI script was not bundled");
    assert.deepEqual(resource.contents[0]._meta["openai/ui"].availableDisplayModes, ["fullscreen"]);
    const preview = toolList.tools.find((tool) => tool.name === "elearn_preview_downloads");
    const confirmation = toolList.tools.find((tool) => tool.name === "elearn_confirm_downloads");
    assert.deepEqual(confirmation._meta.ui.visibility, ["app"]);
    const previewResource = await client.readResource({ uri: preview._meta.ui.resourceUri });
    assert.match(previewResource.contents[0].text, /Confirm downloads/);
    assert.equal(previewResource.contents[0]._meta["openai/ui"].preferredDisplayMode, "inline");
    console.log(`${pluginServer.client} plugin MCP handshake passed (${names.length} tools)`);
  } finally {
    await client.close().catch(() => undefined);
  }
}
