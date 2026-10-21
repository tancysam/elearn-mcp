import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { APIRequestContext } from "playwright-core";
import { D2LClient } from "../src/d2l-client.js";
import { loadConfig } from "../src/config.js";
import {
  courseBrowserData,
  downloadDocuments,
} from "../src/browser-service.js";
import {
  canDownload,
  fileType,
  filterBrowserDocuments,
  singaporeDate,
} from "../src/browser-model.js";
import type { D2LTableOfContents } from "../src/types.js";

const toc: D2LTableOfContents = {
  Modules: [
    {
      ModuleId: 1,
      Title: "Week 1",
      Topics: [
        {
          TopicId: 11,
          Title: "Lecture",
          Url: "/files/lecture.PDF?download=1",
          ActivityType: 1,
          LastModifiedDate: "2026-10-06T16:30:00Z",
        },
      ],
      Modules: [
        {
          ModuleId: 2,
          Title: "Exercises",
          Topics: [
            {
              TopicId: 12,
              Title: "exercise.zip",
              ActivityType: 1,
              LastModifiedDate: "2026-10-07T16:01:00Z",
            },
          ],
        },
        {
          ModuleId: 3,
          Title: "Private",
          IsHidden: true,
          Topics: [{ TopicId: 13, Title: "secret.pdf", ActivityType: 1 }],
        },
      ],
    },
    {
      ModuleId: 4,
      Title: "Week 1",
      Topics: [
        {
          TopicId: 14,
          Title: "Same title, different module.pdf",
          ActivityType: 1,
        },
          { TopicId: 15, Title: "Reading", ActivityType: 2, Url: "https://example.com/reading.pdf" },
        { TopicId: 16, Title: "hidden.pdf", ActivityType: 1, IsHidden: true },
      ],
    },
    {
      ModuleId: 5,
      Title: "Week 2",
      IsLocked: true,
      Modules: [
        {
          ModuleId: 6,
          Title: "Exercises",
          Topics: [{ TopicId: 17, Title: "future.pdf", ActivityType: 1 }],
        },
      ],
    },
  ],
};
const filters = {
  moduleId: null,
  query: "",
  fileType: "",
  since: "",
  until: "",
};

describe("course browser filtering", () => {
  const data = courseBrowserData(123, toc, "https://example.edu");
  it("uses exact module ancestry, including nested files and excluding hidden modules/topics", () => {
    expect(data.documents.map((item) => item.topicId)).toEqual([
      11, 12, 14, 15, 17,
    ]);
    expect(
      filterBrowserDocuments(data.documents, { ...filters, moduleId: 1 }).map(
        (item) => item.topicId,
      ),
    ).toEqual([11, 12]);
    expect(data.weeks.map((week) => week.documentCount)).toEqual([2, 2, 1]);
    expect(data.documents[0]?.webUrl).toBe(
      "https://example.edu/d2l/le/lessons/123/topics/11",
    );
  });
  it("propagates parent locks and distinguishes links from downloadable files", () => {
    expect(
      data.documents.filter(canDownload).map((item) => item.topicId),
    ).toEqual([11, 12, 14]);
  });
  it("combines extension, nested-module search and week filters", () => {
    expect(
      filterBrowserDocuments(data.documents, {
        ...filters,
        query: "EXERCISES",
        moduleId: 1,
        fileType: "zip",
      }).map((item) => item.topicId),
    ).toEqual([12]);
    expect(fileType(data.documents[0]!)).toBe("pdf");
    expect(fileType(data.documents[3]!)).toBe("link");
  });
  it("uses inclusive Singapore dates and excludes missing dates", () => {
    expect(singaporeDate("2026-10-06T16:30:00Z")).toBe("2026-10-07");
    expect(singaporeDate("invalid")).toBe("");
    expect(
      filterBrowserDocuments(data.documents, {
        ...filters,
        since: "2026-10-07",
        until: "2026-10-07",
      }).map((item) => item.topicId),
    ).toEqual([11]);
  });
});

describe("selected-file downloads", () => {
  it("writes real batch files without replacing an existing filename", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "elearn-browser-test-"));
    try {
      await writeFile(path.join(directory, "lecture.pdf"), "original");
      const request = { get: async () => ({
        status: () => 200,
        headers: () => ({ "content-type": "application/pdf", "content-disposition": 'attachment; filename="lecture.pdf"' }),
        body: async () => Buffer.from("downloaded"),
      }) } as unknown as APIRequestContext;
      const client = new D2LClient(request, loadConfig());
      const results = await downloadDocuments({ getTableOfContents: async () => toc, downloadTopic: client.downloadTopic.bind(client) }, [{ courseId: 123, topicId: 11 }, { courseId: 123, topicId: 14 }], directory, "https://example.edu");
      expect(results.every((item) => item.success)).toBe(true);
      expect(await readFile(path.join(directory, "lecture.pdf"), "utf8")).toBe("original");
      expect(await readFile(path.join(directory, "lecture-1.pdf"), "utf8")).toBe("downloaded");
      expect(await readFile(path.join(directory, "lecture-2.pdf"), "utf8")).toBe("downloaded");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("deduplicates, preserves partial success, and rejects hidden/locked/link/missing items", async () => {
    const client = {
      getTableOfContents: vi.fn(async () => toc),
      downloadTopic: vi.fn(async (courseId: number, topicId: number) => {
        if (topicId === 12) throw new Error("Network interrupted");
        return {
          courseId,
          topicId,
          filename: "lecture.pdf",
          path: "/tmp/lecture.pdf",
          bytes: 10,
          contentType: "application/pdf",
        };
      }),
    };
    const results = await downloadDocuments(
      client,
      [11, 11, 12, 13, 15, 17, 99, 14].map((topicId) => ({
        courseId: 123,
        topicId,
      })),
      "/tmp",
      "https://example.edu",
    );
    expect(results.map((item) => [item.topicId, item.success])).toEqual([
      [11, true],
      [12, false],
      [13, false],
      [15, false],
      [17, false],
      [99, false],
      [14, true],
    ]);
    expect(client.getTableOfContents).toHaveBeenCalledTimes(1);
    expect(client.downloadTopic).toHaveBeenCalledTimes(3);
    expect(results[1]).toMatchObject({ error: "Network interrupted" });
  });
  it("reports a failed course without preventing downloads from another course", async () => {
    const client = {
      getTableOfContents: vi.fn(async (courseId: number) => {
        if (courseId === 1) throw new Error("Access denied");
        return toc;
      }),
      downloadTopic: vi.fn(async (courseId: number, topicId: number) => ({
        courseId,
        topicId,
        filename: "lecture.pdf",
        path: "/tmp/lecture.pdf",
        bytes: 10,
        contentType: null,
      })),
    };
    const results = await downloadDocuments(
      client,
      [
        { courseId: 1, topicId: 11 },
        { courseId: 1, topicId: 12 },
        { courseId: 2, topicId: 11 },
      ],
      "/tmp",
      "https://example.edu",
    );
    expect(results.map((item) => item.success)).toEqual([false, false, true]);
    expect(client.getTableOfContents).toHaveBeenCalledTimes(2);
  });
});
