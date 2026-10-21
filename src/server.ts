#!/usr/bin/env node
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  endOfLocalWeek,
  filterDocumentsByModifiedDate,
  getAllDocuments,
  getDocumentsForWeek,
  listCourseWeeks,
  startOfLocalWeek,
} from "./content.js";
import type { D2LClient } from "./d2l-client.js";
import { ElearnError } from "./errors.js";
import { SessionManager } from "./session.js";
import { BROWSER_ICON, registerCourseBrowser } from "./browser-app.js";
import type { Course, CourseDocument } from "./types.js";

const config = loadConfig();
const sessions = new SessionManager(config);
const server = new McpServer({
  name: "smu-elearn",
  version: "0.3.0",
  icons: [BROWSER_ICON],
});

registerCourseBrowser(server, () => sessions.client(), config);

const positiveId = z.number().int().positive();
const weekValue = z.union([z.number().int().min(1).max(99), z.string().min(1).max(100)]);

function jsonResult(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errorResult(error: unknown) {
  const normalized =
    error instanceof ElearnError
      ? { error: error.code, message: error.message, status: error.status, details: error.details }
      : {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(normalized, null, 2) }],
  };
}

async function run<T extends Record<string, unknown>>(
  operation: (client: D2LClient) => Promise<T>,
) {
  try {
    return jsonResult(await operation(await sessions.client()));
  } catch (error) {
    return errorResult(error);
  }
}

server.registerTool(
  "elearn_authenticate",
  {
    title: "Authenticate with SMU eLearn",
    description:
      "Sign in through a dedicated Edge or Chrome profile, verify SMU SSO/MFA, and save owner-only session state. The browser argument selects the browser for this server process; ELEARN_BROWSER sets the startup default.",
    inputSchema: {
      browser: z.enum(["edge", "chrome"]).optional(),
      initialWaitSeconds: z.number().min(1).max(300).default(60),
      pollIntervalSeconds: z.number().min(1).max(60).default(15),
      timeoutSeconds: z.number().min(10).max(600).default(300),
    },
  },
  async ({ browser, initialWaitSeconds, pollIntervalSeconds, timeoutSeconds }) => {
    try {
      const result = await sessions.authenticateInteractively({
        ...(browser ? { browser } : {}),
        initialWaitSeconds,
        pollIntervalSeconds,
        timeoutSeconds,
        log: (message) => console.error(`[eLearn auth] ${message}`),
      });
      return jsonResult({ ...result });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "elearn_auth_status",
  {
    title: "Check eLearn authentication",
    description: "Check whether the selected browser session is currently authenticated with SMU eLearn.",
    inputSchema: {},
  },
  async () =>
    run(async (client) => {
      await client.whoAmI();
      return {
        authenticated: true,
        baseUrl: config.baseUrl,
        lpVersion: config.lpVersion,
        leVersion: config.leVersion,
      };
    }),
);

server.registerTool(
  "elearn_list_courses",
  {
    title: "List eLearn courses",
    description:
      "List accessible SMU eLearn courses. Results include stable course IDs, course codes, term dates, access state, and pin state.",
    inputSchema: {
      search: z.string().max(200).optional().describe("Optional case-insensitive course name or code search."),
      activeOnly: z.boolean().default(true).describe("Only include active and accessible courses."),
      pinnedOnly: z.boolean().default(false).describe("Only include courses with a PinDate."),
      limit: z.number().int().min(1).max(500).default(200),
    },
  },
  async ({ search, activeOnly, pinnedOnly, limit }) =>
    run(async (client) => {
      const courses = await client.listCourses({
        ...(search === undefined ? {} : { search }),
        activeOnly,
        pinnedOnly,
        limit,
      });
      return { count: courses.length, courses };
    }),
);

server.registerTool(
  "elearn_list_pinned_courses",
  {
    title: "List pinned eLearn courses",
    description: "List courses pinned by the current user, ordered by pin date and course name.",
    inputSchema: {
      search: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    },
  },
  async ({ search, limit }) =>
    run(async (client) => {
      const courses = await client.listCourses({
        ...(search === undefined ? {} : { search }),
        pinnedOnly: true,
        activeOnly: true,
        limit,
      });
      return { count: courses.length, courses };
    }),
);

server.registerTool(
  "elearn_list_course_weeks",
  {
    title: "List weekly modules in a course",
    description:
      "Find nested course-content modules named Week/Wk/W followed by a number and report their IDs, paths, dates, and document counts.",
    inputSchema: {
      courseId: positiveId.describe("The numeric course organization-unit ID from elearn_list_courses."),
      includeLinks: z.boolean().default(false),
      includeHidden: z.boolean().default(false),
    },
  },
  async ({ courseId, includeLinks, includeHidden }) =>
    run(async (client) => {
      const toc = await client.getTableOfContents(courseId);
      const weeks = listCourseWeeks(courseId, toc, { includeLinks, includeHidden });
      return { courseId, count: weeks.length, weeks };
    }),
);

server.registerTool(
  "elearn_get_week_documents",
  {
    title: "Get documents for a course week",
    description:
      "Return every accessible file topic recursively contained in matching Week modules for one course. Week can be a number (for example 3) or title fragment.",
    inputSchema: {
      courseId: positiveId.describe("The numeric course ID."),
      week: weekValue.describe("A week number or module-title fragment, such as 3 or 'Week 3'."),
      includeLinks: z.boolean().default(false).describe("Also include link topics, not only files."),
      includeHidden: z.boolean().default(false).describe("Include hidden topics if the API exposes them."),
    },
  },
  async ({ courseId, week, includeLinks, includeHidden }) =>
    run(async (client) => {
      const toc = await client.getTableOfContents(courseId);
      const documents = getDocumentsForWeek(courseId, toc, week, { includeLinks, includeHidden });
      const availableWeeks = listCourseWeeks(courseId, toc, { includeLinks, includeHidden });
      return {
        courseId,
        week,
        count: documents.length,
        documents,
        ...(documents.length === 0 ? { availableWeeks } : {}),
      };
    }),
);

server.registerTool(
  "elearn_get_recent_documents",
  {
    title: "Get documents uploaded or modified during a calendar week",
    description:
      "Search file topics by D2L LastModifiedDate across pinned courses (default), all active courses, or explicit course IDs. Defaults to the current Monday-through-Sunday week in local time.",
    inputSchema: {
      scope: z.enum(["pinned", "all"]).default("pinned"),
      courseIds: z.array(positiveId).max(100).optional().describe("Explicit course IDs override scope."),
      since: z.iso.datetime({ offset: true }).optional().describe("Inclusive ISO-8601 start time."),
      until: z.iso.datetime({ offset: true }).optional().describe("Inclusive ISO-8601 end time."),
      includeLinks: z.boolean().default(false),
      includeHidden: z.boolean().default(false),
      maxCourses: z.number().int().min(1).max(100).default(25),
    },
  },
  async ({ scope, courseIds, since, until, includeLinks, includeHidden, maxCourses }) =>
    run(async (client) => {
      const start = since ? new Date(since) : startOfLocalWeek();
      const end = until ? new Date(until) : endOfLocalWeek();
      if (end.getTime() < start.getTime()) {
        throw new ElearnError("until must be on or after since.", "INVALID_DATE_RANGE");
      }

      let courses = await client.listCourses({
        activeOnly: true,
        pinnedOnly: courseIds?.length ? false : scope === "pinned",
      });
      if (courseIds?.length) {
        const selected = new Set(courseIds);
        courses = courses.filter((course) => selected.has(course.id));
      }
      courses = courses.slice(0, maxCourses);

      const perCourse = await mapWithConcurrency(courses, 4, async (course) => {
        const toc = await client.getTableOfContents(course.id);
        const all = getAllDocuments(course.id, toc, { includeLinks, includeHidden }, course.name);
        return filterDocumentsByModifiedDate(all, start, end);
      });
      const documents = perCourse.flat().sort(compareDocumentDatesDescending);
      return {
        since: start.toISOString(),
        until: end.toISOString(),
        scope: courseIds?.length ? "explicit" : scope,
        coursesChecked: courses.map(({ id, name, code }) => ({ id, name, code })),
        count: documents.length,
        documents,
      };
    }),
);

server.registerTool(
  "elearn_get_course_documents",
  {
    title: "Get all documents for a course",
    description:
      "Return all accessible file topics in a course, recursively, with module paths and availability/modified dates.",
    inputSchema: {
      courseId: positiveId,
      includeLinks: z.boolean().default(false),
      includeHidden: z.boolean().default(false),
    },
  },
  async ({ courseId, includeLinks, includeHidden }) =>
    run(async (client) => {
      const toc = await client.getTableOfContents(courseId);
      const documents = getAllDocuments(courseId, toc, { includeLinks, includeHidden });
      return { courseId, count: documents.length, documents };
    }),
);

server.registerTool(
  "elearn_search_content",
  {
    title: "Search eLearn course content",
    description:
      "Search document titles and module paths across pinned courses, all active courses, or explicit course IDs.",
    inputSchema: {
      query: z.string().min(2).max(200),
      scope: z.enum(["pinned", "all"]).default("pinned"),
      courseIds: z.array(positiveId).max(100).optional(),
      includeLinks: z.boolean().default(true),
      maxCourses: z.number().int().min(1).max(100).default(25),
      limit: z.number().int().min(1).max(500).default(100),
    },
  },
  async ({ query, scope, courseIds, includeLinks, maxCourses, limit }) =>
    run(async (client) => {
      const needle = query.toLowerCase();
      let courses = await client.listCourses({
        activeOnly: true,
        pinnedOnly: courseIds?.length ? false : scope === "pinned",
      });
      if (courseIds?.length) {
        const selected = new Set(courseIds);
        courses = courses.filter((course) => selected.has(course.id));
      }
      courses = courses.slice(0, maxCourses);
      const groups = await mapWithConcurrency(courses, 4, async (course) => {
        const toc = await client.getTableOfContents(course.id);
        return getAllDocuments(course.id, toc, { includeLinks }, course.name).filter((document) =>
          `${document.title} ${document.modulePath.join(" ")}`.toLowerCase().includes(needle),
        );
      });
      const documents = groups.flat().slice(0, limit);
      return { query, count: documents.length, documents };
    }),
);

server.registerTool(
  "elearn_get_document_metadata",
  {
    title: "Get eLearn document metadata",
    description: "Get the D2L content-topic metadata for one course document.",
    inputSchema: {
      courseId: positiveId,
      topicId: positiveId,
    },
  },
  async ({ courseId, topicId }) =>
    run(async (client) => {
      const document = await client.getContentObject(courseId, topicId);
      return { courseId, topicId, document };
    }),
);

server.registerTool(
  "elearn_download_document",
  {
    title: "Download an eLearn document",
    description:
      "Download a file topic after user approval. For weekly or search-based requests, use elearn_preview_downloads first and wait for confirmation. Download to the configured local download directory. Existing files are never overwritten; a numeric suffix is added.",
    inputSchema: {
      courseId: positiveId,
      topicId: positiveId,
      filename: z.string().min(1).max(255).optional(),
      destinationDir: z.string().min(1).optional().describe("Optional absolute destination directory."),
    },
  },
  async ({ courseId, topicId, filename, destinationDir }) =>
    run(async (client) => {
      if (destinationDir !== undefined && !path.isAbsolute(destinationDir)) {
        throw new ElearnError("destinationDir must be an absolute path.", "INVALID_DESTINATION");
      }
      const metadata = filename ? null : await client.getContentObject(courseId, topicId);
      const download = await client.downloadTopic(
        courseId,
        topicId,
        path.resolve(destinationDir ?? config.downloadDir),
        filename,
        metadata?.Title,
      );
      return { download };
    }),
);

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function compareDocumentDatesDescending(a: CourseDocument, b: CourseDocument): number {
  return (b.lastModifiedDate ?? "").localeCompare(a.lastModifiedDate ?? "");
}

async function shutdown(): Promise<void> {
  await sessions.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("SMU eLearn MCP server is running over stdio.");
