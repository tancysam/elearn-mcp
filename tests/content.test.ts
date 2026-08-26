import { describe, expect, it } from "vitest";
import {
  filterDocumentsByModifiedDate,
  getAllDocuments,
  getDocumentsForWeek,
  listCourseWeeks,
  moduleMatchesWeek,
  parseWeekNumber,
} from "../src/content.js";
import type { D2LModule, D2LTableOfContents } from "../src/types.js";

const toc: D2LTableOfContents = {
  Modules: [
    {
      ModuleId: 100,
      Title: "Course Information",
      Topics: [
        {
          TopicId: 1001,
          Title: "Syllabus.pdf",
          Url: "/content/enforced/1/syllabus.pdf",
          ActivityType: 1,
          LastModifiedDate: "2026-08-18T03:00:00.000Z",
        },
      ],
      Modules: [
        {
          ModuleId: 101,
          Title: "Week 01 — Foundations",
          StartDateTime: "2026-08-17T00:00:00.000Z",
          LastModifiedDate: "2026-08-20T00:00:00.000Z",
          Topics: [
            {
              TopicId: 1011,
              Title: "W01-Slides.pptx",
              Url: "/content/enforced/1/Week 1/W01-Slides.pptx",
              ActivityType: 1,
              LastModifiedDate: "2026-08-20T04:00:00.000Z",
            },
            {
              TopicId: 1012,
              Title: "External reading",
              Url: "https://example.com/reading",
              ActivityType: 2,
              LastModifiedDate: "2026-08-21T04:00:00.000Z",
            },
            {
              TopicId: 1013,
              Title: "Instructor notes.pdf",
              Url: "/content/enforced/1/Week 1/private.pdf",
              ActivityType: 1,
              IsHidden: true,
              LastModifiedDate: "2026-08-22T04:00:00.000Z",
            },
          ],
          Modules: [
            {
              ModuleId: 102,
              Title: "Exercises",
              Topics: [
                {
                  TopicId: 1021,
                  Title: "exercise.bpmn",
                  Url: "/content/enforced/1/Week 1/exercise.bpmn",
                  LastModifiedDate: "2026-08-23T04:00:00.000Z",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      ModuleId: 110,
      Title: "Week 10",
      Topics: [
        {
          TopicId: 1101,
          Title: "W10.pdf",
          Url: "/content/enforced/1/Week 10/W10.pdf",
          ActivityType: 1,
          LastModifiedDate: "2026-10-20T04:00:00.000Z",
        },
      ],
    },
  ],
};

describe("week matching", () => {
  it("parses common week labels", () => {
    expect(parseWeekNumber("Week 01 — Foundations")).toBe(1);
    expect(parseWeekNumber("WK-3")).toBe(3);
    expect(parseWeekNumber("W12")).toBe(12);
    expect(parseWeekNumber("Course Information")).toBeNull();
  });

  it("does not confuse Week 1 and Week 10", () => {
    const week1 = toc.Modules[0]?.Modules?.[0] as D2LModule;
    const week10 = toc.Modules[1] as D2LModule;
    expect(moduleMatchesWeek(week1, 1)).toBe(true);
    expect(moduleMatchesWeek(week10, 1)).toBe(false);
  });
});

describe("document extraction", () => {
  it("recursively finds files for a requested week", () => {
    const documents = getDocumentsForWeek(463052, toc, 1);
    expect(documents.map((document) => document.topicId)).toEqual([1011, 1021]);
    expect(documents[1]?.modulePath).toEqual(["Course Information", "Week 01 — Foundations", "Exercises"]);
  });

  it("can include links and hidden topics when requested", () => {
    const documents = getDocumentsForWeek(463052, toc, "Week 1", {
      includeLinks: true,
      includeHidden: true,
    });
    expect(documents.map((document) => document.topicId)).toEqual([1011, 1012, 1013, 1021]);
  });

  it("lists weekly modules with recursive document counts", () => {
    const weeks = listCourseWeeks(463052, toc);
    expect(weeks.map(({ weekNumber, documentCount }) => [weekNumber, documentCount])).toEqual([
      [1, 2],
      [10, 1],
    ]);
  });

  it("filters recent documents by inclusive LastModifiedDate", () => {
    const documents = getAllDocuments(463052, toc, { includeLinks: true });
    const recent = filterDocumentsByModifiedDate(
      documents,
      new Date("2026-08-20T00:00:00.000Z"),
      new Date("2026-08-23T23:59:59.999Z"),
    );
    expect(recent.map((document) => document.topicId)).toEqual([1011, 1012, 1021]);
  });
});
