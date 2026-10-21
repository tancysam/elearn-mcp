import { describe, expect, it, vi } from "vitest";
import {
  DownloadPreviews,
  thisSingaporeWeek,
} from "../src/download-preview.js";
import { loadConfig } from "../src/config.js";
import type { Course } from "../src/types.js";

function fixture() {
  return {
    listCourses: vi.fn(
      async () =>
        [
          { id: 1, name: "WAD2", isPinned: true },
          { id: 2, name: "Algo", isPinned: true },
        ] as Course[],
    ),
    getTableOfContents: vi.fn(async () => ({
      Modules: [
        {
          ModuleId: 6,
          Title: "Week 6",
          Topics: [
            {
              TopicId: 1,
              Title: "DOM.pdf",
              ActivityType: 1,
              LastModifiedDate: "2026-10-04T16:00:00Z",
            },
            {
              TopicId: 2,
              Title: "Old DOM.pdf",
              ActivityType: 1,
              LastModifiedDate: "2026-09-01T01:00:00Z",
            },
            {
              TopicId: 3,
              Title: "Private.pdf",
              ActivityType: 1,
              IsHidden: true,
            },
          ],
        },
      ],
    })),
    downloadTopic: vi.fn(async (courseId: number, topicId: number) => ({
      courseId,
      topicId,
      filename: "DOM.pdf",
      path: "/tmp/DOM.pdf",
      bytes: 10,
      contentType: "application/pdf",
    })),
  };
}
const now = () => new Date("2026-10-07T03:00:00Z");
describe("preview then confirm", () => {
  it("previews Singapore calendar-week matches across courses without writing files", async () => {
    expect(thisSingaporeWeek(new Date("2026-10-04T16:00:00Z"))).toEqual({
      since: "2026-10-05",
      until: "2026-10-11",
    });
    const client = fixture();
    const preview = await new DownloadPreviews(loadConfig(), now).prepare(
      client,
      {},
    );
    expect(
      preview.documents.map((item) => [item.courseId, item.topicId]),
    ).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(preview.description).toContain("2026-10-05 through 2026-10-11");
    expect(client.downloadTopic).not.toHaveBeenCalled();
  });
  it("searches all dates by default and can combine an academic week and a calendar period", async () => {
    const plans = new DownloadPreviews(loadConfig(), now);
    expect(
      (await plans.prepare(fixture(), { query: "DOM" })).documents,
    ).toHaveLength(4);
    expect(
      (
        await plans.prepare(fixture(), {
          query: "DOM",
          week: 6,
          period: "this_week",
        })
      ).documents,
    ).toHaveLength(2);
    expect(
      (await plans.prepare(fixture(), { week: 7 })).documents,
    ).toHaveLength(0);
  });
  it("rejects off-list selections and repeat confirmations, while keeping course IDs distinct", async () => {
    const client = fixture();
    const plans = new DownloadPreviews(loadConfig(), now);
    const preview = await plans.prepare(client, {});
    await expect(
      plans.confirm(client, preview.previewId, [{ courseId: 1, topicId: 2 }]),
    ).rejects.toThrow("pending files");
    expect(client.downloadTopic).not.toHaveBeenCalled();
    const results = await plans.confirm(client, preview.previewId, [
      { courseId: 1, topicId: 1 },
      { courseId: 1, topicId: 1 },
    ]);
    expect(results.succeeded).toBe(1);
    await expect(
      plans.confirm(client, preview.previewId, [{ courseId: 1, topicId: 1 }]),
    ).rejects.toThrow("pending files");
    expect(
      (
        await plans.confirm(client, preview.previewId, [
          { courseId: 2, topicId: 1 },
        ])
      ).succeeded,
    ).toBe(1);
  });
  it("expires previews and reports partial course failures", async () => {
    let time = now();
    const client = fixture();
    const plans = new DownloadPreviews(loadConfig(), () => time);
    client.getTableOfContents.mockRejectedValueOnce(
      new Error("Course unavailable"),
    );
    const preview = await plans.prepare(client, {});
    expect(preview.warnings[0]).toContain("WAD2: Course unavailable");
    expect(preview.documents).toHaveLength(1);
    time = new Date(time.getTime() + 31 * 60 * 1000);
    await expect(
      plans.confirm(client, preview.previewId, [{ courseId: 2, topicId: 1 }]),
    ).rejects.toThrow("expired");
    expect(client.downloadTopic).not.toHaveBeenCalled();
  });
  it("supports a discovered document list and rejects ambiguous date filters", async () => {
    const plans = new DownloadPreviews(loadConfig(), now);
    const preview = await plans.prepare(fixture(), {
      documents: [
        { courseId: 1, topicId: 2 },
        { courseId: 1, topicId: 3 },
      ],
    });
    expect(preview.documents.map((item) => item.topicId)).toEqual([2]);
    expect(preview.warnings).toHaveLength(1);
    await expect(
      plans.prepare(fixture(), { since: "2026-10-10", until: "2026-10-01" }),
    ).rejects.toThrow("end date");
  });
});
