import { randomUUID } from "node:crypto";
import path from "node:path";
import type { D2LClient } from "./d2l-client.js";
import {
  canDownload,
  filterBrowserDocuments,
  singaporeDate,
  type BrowserDocument,
} from "./browser-model.js";
import {
  courseBrowserData,
  downloadDocuments,
  type DocumentSelection,
} from "./browser-service.js";
import { ElearnError } from "./errors.js";
import type { Config } from "./config.js";

export interface PreviewRequest {
  scope?: "pinned" | "all" | undefined;
  courseIds?: number[] | undefined;
  query?: string | undefined;
  week?: number | undefined;
  period?: "this_week" | "all" | undefined;
  since?: string | undefined;
  until?: string | undefined;
  documents?: DocumentSelection[] | undefined;
}

export interface DownloadPreview {
  previewId: string;
  request: PreviewRequest;
  documents: BrowserDocument[];
  downloadDirectory: string;
  expiresAt: string;
  description: string;
  warnings: string[];
  omitted: number;
}

export function thisSingaporeWeek(now: Date): { since: string; until: string } {
  const date = new Date(`${singaporeDate(now.toISOString())}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const since = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { since, until: date.toISOString().slice(0, 10) };
}

const key = (item: DocumentSelection) => `${item.courseId}:${item.topicId}`;
const TTL = 30 * 60 * 1000;

/** In-memory plans are bound to this local MCP process; refresh after expiry/restart. */
export class DownloadPreviews {
  private plans = new Map<
    string,
    { preview: DownloadPreview; remaining: Set<string>; busy: boolean }
  >();
  constructor(
    private config: Config,
    private now: () => Date = () => new Date(),
  ) {}

  async prepare(
    client: Pick<D2LClient, "listCourses" | "getTableOfContents">,
    request: PreviewRequest,
  ): Promise<DownloadPreview> {
    const now = this.now();
    for (const [id, plan] of this.plans)
      if (!plan.busy && Date.parse(plan.preview.expiresAt) <= now.getTime())
        this.plans.delete(id);
    if (this.plans.size >= 100)
      throw new ElearnError(
        "Too many active previews. Wait for an earlier preview to expire.",
        "PREVIEW_LIMIT",
      );
    if (
      request.documents?.length &&
      (request.query ||
        request.week ||
        request.since ||
        request.until ||
        request.period)
    ) {
      throw new ElearnError(
        "Use either explicit documents or search/date/week filters.",
        "INVALID_PREVIEW_FILTERS",
      );
    }
    const useThisWeek =
      request.period === "this_week" ||
      (request.period === undefined &&
        !request.query &&
        !request.week &&
        !request.since &&
        !request.until &&
        !request.documents?.length);
    if (useThisWeek && (request.since || request.until))
      throw new ElearnError(
        "Use either this_week or explicit dates.",
        "INVALID_PREVIEW_FILTERS",
      );
    const dates = useThisWeek
      ? thisSingaporeWeek(now)
      : { since: request.since ?? "", until: request.until ?? "" };
    if (dates.since && dates.until && dates.since > dates.until)
      throw new ElearnError(
        "The end date must be on or after the start date.",
        "INVALID_DATE_RANGE",
      );
    const explicitCourses = request.documents?.length
      ? new Set(request.documents.map((item) => item.courseId))
      : request.courseIds?.length
        ? new Set(request.courseIds)
        : null;
    const courses = (
      await client.listCourses({
        activeOnly: true,
        pinnedOnly: !explicitCourses && request.scope !== "all",
      })
    ).filter((course) => !explicitCourses || explicitCourses.has(course.id));
    const warnings: string[] = [];
    if (explicitCourses)
      for (const id of explicitCourses)
        if (!courses.some((course) => course.id === id))
          warnings.push(
            `Course ${id} is not accessible; its files are not included.`,
          );
    const requested = request.documents
      ? new Set(request.documents.map(key))
      : null;
    const matches: BrowserDocument[] = [];
    for (const course of courses) {
      try {
        const data = courseBrowserData(
          course.id,
          await client.getTableOfContents(course.id),
          this.config.baseUrl,
        );
        const weeks = request.week
          ? new Set(
              data.weeks
                .filter((week) => week.weekNumber === request.week)
                .map((week) => week.moduleId),
            )
          : null;
        const filtered = filterBrowserDocuments(data.documents, {
          moduleId: null,
          query: request.query ?? "",
          fileType: "",
          ...dates,
        });
        for (const document of filtered) {
          if (requested && !requested.has(key(document))) continue;
          if (weeks && !document.moduleIds.some((id) => weeks.has(id)))
            continue;
          if (canDownload(document))
            matches.push({ ...document, courseName: course.name });
        }
      } catch (error) {
        warnings.push(
          `${course.name}: ${error instanceof Error ? error.message : "Unable to load this course."}`,
        );
      }
    }
    if (requested)
      for (const id of requested)
        if (!matches.some((item) => key(item) === id))
          warnings.push(`File ${id} is not available for download.`);
    const parts = [
      requested
        ? "Selected course files"
        : request.query
          ? `Search: “${request.query}”`
          : "Course files",
    ];
    if (request.week) parts.push(`academic Week ${request.week}`);
    if (dates.since || dates.until)
      parts.push(
        `modified ${dates.since || "any time"} through ${dates.until || "today and later"} (Singapore time)`,
      );
    parts.push(
      explicitCourses
        ? `${courses.length} selected courses`
        : request.scope === "all"
          ? "all accessible courses"
          : "pinned courses",
    );
    const preview: DownloadPreview = {
      previewId: randomUUID(),
      request,
      documents: matches.slice(0, 500),
      downloadDirectory: path.resolve(this.config.downloadDir),
      expiresAt: new Date(now.getTime() + TTL).toISOString(),
      description: parts.join(" · "),
      warnings,
      omitted: Math.max(0, matches.length - 500),
    };
    this.plans.set(preview.previewId, {
      preview,
      remaining: new Set(preview.documents.map(key)),
      busy: false,
    });
    return preview;
  }

  async confirm(
    client: Pick<D2LClient, "getTableOfContents" | "downloadTopic">,
    previewId: string,
    selection: DocumentSelection[],
  ) {
    const plan = this.plans.get(previewId);
    if (!plan || Date.parse(plan.preview.expiresAt) <= this.now().getTime())
      throw new ElearnError(
        "This preview has expired or the server restarted. Refresh the preview and review the files again.",
        "PREVIEW_EXPIRED",
      );
    if (plan.busy)
      throw new ElearnError(
        "These downloads are already running.",
        "PREVIEW_BUSY",
      );
    if (
      !selection.length ||
      selection.length > 50 ||
      selection.some((item) => !plan.remaining.has(key(item)))
    )
      throw new ElearnError(
        "Choose up to 50 pending files from this preview. Already saved files cannot be downloaded again from the same preview.",
        "INVALID_PREVIEW_SELECTION",
      );
    plan.busy = true;
    try {
      const results = await downloadDocuments(
        client,
        selection,
        plan.preview.downloadDirectory,
        this.config.baseUrl,
      );
      for (const item of results)
        if (item.success) plan.remaining.delete(key(item));
      return {
        results,
        succeeded: results.filter((item) => item.success).length,
        failed: results.filter((item) => !item.success).length,
      };
    } finally {
      plan.busy = false;
    }
  }
}
