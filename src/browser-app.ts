import { readFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type {
  OpenAIUiResourceMetadata,
  OpenAIUiToolMetadata,
} from "@openai/mcp-extensions/server";
import { z } from "zod";
import type { Config } from "./config.js";
import type { D2LClient } from "./d2l-client.js";
import { courseBrowserData, downloadDocuments } from "./browser-service.js";
import { ElearnError } from "./errors.js";
import { DownloadPreviews } from "./download-preview.js";

export const BROWSER_URI = "ui://smu-elearn/course-browser";
export const PREVIEW_URI = "ui://smu-elearn/download-preview";
export const BROWSER_ICON = {
  src:
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33"><path d="M2 4h6l2 2h8v11H2z"/><path d="M6 10h8M6 13h5"/></svg>',
    ),
  mimeType: "image/svg+xml",
  sizes: ["any"],
};

export function registerCourseBrowser(
  server: McpServer,
  getClient: () => Promise<D2LClient>,
  config: Config,
): void {
  const previews = new DownloadPreviews(config);
  async function result(
    operation: (client: D2LClient) => Promise<Record<string, unknown>>,
  ) {
    try {
      const data = await operation(await getClient());
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      };
    } catch (error) {
      const data = {
        error: error instanceof ElearnError ? error.code : "INTERNAL_ERROR",
        message:
          error instanceof Error ? error.message : "Unable to load eLearn.",
      };
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      };
    }
  }

  registerAppResource(
    server,
    "eLearn course browser",
    BROWSER_URI,
    {},
    async () => ({
      contents: [
        {
          uri: BROWSER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            new URL(
              import.meta.url.endsWith(".ts")
                ? "../dist/ui/course-browser.html"
                : "../ui/course-browser.html",
              import.meta.url,
            ),
            "utf8",
          ),
          _meta: {
            ui: { csp: { connectDomains: [], resourceDomains: [] } },
            "openai/ui": {
              preferredDisplayMode: "fullscreen",
              availableDisplayModes: ["fullscreen"],
            } satisfies OpenAIUiResourceMetadata,
          },
        },
      ],
    }),
  );

  const opener = {
    title: "Course browser",
    description:
      "Open an interactive SMU eLearn browser with pinned courses, weekly modules, document filters, and selected-file downloads.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: {
      ui: {
        resourceUri: BROWSER_URI,
        visibility: ["model", "app"] as ("model" | "app")[],
      },
      "openai/ui": {
        entrypoints: [{ type: "global" }, { type: "thread" }],
      } satisfies OpenAIUiToolMetadata,
    },
  };
  registerAppResource(
    server,
    "eLearn download preview",
    PREVIEW_URI,
    {},
    async () => ({
      contents: [
        {
          uri: PREVIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            new URL(
              import.meta.url.endsWith(".ts")
                ? "../dist/ui/download-preview.html"
                : "../ui/download-preview.html",
              import.meta.url,
            ),
            "utf8",
          ),
          _meta: {
            ui: { csp: { connectDomains: [], resourceDomains: [] } },
            "openai/ui": {
              preferredDisplayMode: "inline",
              availableDisplayModes: ["inline", "fullscreen"],
            } satisfies OpenAIUiResourceMetadata,
          },
        },
      ],
    }),
  );
  registerAppTool(
    server,
    "elearn_preview_downloads",
    {
      title: "Preview eLearn downloads",
      description:
        "Prepare a reviewable list of files WITHOUT downloading. Use first for weekly downloads, search-based downloads, or a selected document list. With no filters, defaults to files modified this Monday–Sunday in Singapore across pinned courses. Query alone searches all dates; use period=this_week to combine. Week means academic Week N, not calendar week. The user confirms selected files in the preview UI. Do not call other download tools to bypass this confirmation.",
      inputSchema: {
        scope: z.enum(["pinned", "all"]).optional(),
        courseIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(100)
          .optional(),
        query: z.string().trim().min(1).max(200).optional(),
        week: z.number().int().min(1).max(99).optional(),
        period: z.enum(["this_week", "all"]).optional(),
        since: z.iso.date().optional(),
        until: z.iso.date().optional(),
        documents: z
          .array(
            z.object({
              courseId: z.number().int().positive(),
              topicId: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(500)
          .optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: {
        ui: { resourceUri: PREVIEW_URI, visibility: ["model", "app"] },
        "openai/ui": {
          preferredModelDisplayMode: "inline",
        } satisfies OpenAIUiToolMetadata,
      },
    },
    async (request) =>
      result(async (client) => ({
        ...(await previews.prepare(client, request)),
      })),
  );
  server.registerTool(
    "elearn_confirm_downloads",
    {
      title: "Confirm previewed downloads",
      description:
        "UI-only action: download the user's checked files from an active preview, after they click Confirm downloads. Rejects files outside the preview and already saved files.",
      inputSchema: {
        previewId: z.string().uuid(),
        documents: z
          .array(
            z.object({
              courseId: z.number().int().positive(),
              topicId: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(50),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ previewId, documents }) =>
      result(async (client) => previews.confirm(client, previewId, documents)),
  );
  registerAppTool(server, "elearn_open_course_browser", opener, async () =>
    result(async (client) => ({
      courses: await client.listCourses({ activeOnly: true }),
      downloadDirectory: path.resolve(config.downloadDir),
    })),
  );

  server.registerTool(
    "elearn_browse_course",
    {
      title: "Load a course in the browser",
      description:
        "Get visible weekly modules and documents with exact module ancestry for course-browser filtering.",
      inputSchema: { courseId: z.number().int().positive() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ courseId }) =>
      result(async (client) => ({
        ...courseBrowserData(
          courseId,
          await client.getTableOfContents(courseId),
          config.baseUrl,
        ),
      })),
  );

  server.registerTool(
    "elearn_download_documents",
    {
      title: "Download selected eLearn files",
      description:
        "Legacy direct download. For weekly, search-based, or multi-file requests, use elearn_preview_downloads first and wait for explicit confirmation. Download up to 50 selected file topics into the configured local download directory without overwriting. Returns individual success/failure results; duplicates are downloaded once.",
      inputSchema: {
        documents: z
          .array(
            z.object({
              courseId: z.number().int().positive(),
              topicId: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(50),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ documents }) =>
      result(async (client) => {
        const results = await downloadDocuments(
          client,
          documents,
          path.resolve(config.downloadDir),
          config.baseUrl,
        );
        return {
          results,
          succeeded: results.filter((item) => item.success).length,
          failed: results.filter((item) => !item.success).length,
        };
      }),
  );
}
