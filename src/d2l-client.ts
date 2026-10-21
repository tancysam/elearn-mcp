import fs from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext, APIResponse } from "playwright-core";
import type { Config } from "./config.js";
import { AuthenticationRequiredError, ElearnError } from "./errors.js";
import type {
  Course,
  D2LContentObject,
  D2LMyOrgUnitInfo,
  D2LPagedResult,
  D2LTableOfContents,
} from "./types.js";

import type { CalendarEvent } from "./events.js";
import type { Announcement } from "./announcements.js";

type QueryValue = string | number | boolean | undefined | null;

export interface ListCoursesOptions {
  activeOnly?: boolean;
  pinnedOnly?: boolean;
  search?: string;
  limit?: number;
}

export interface DownloadResult {
  courseId: number;
  topicId: number;
  filename: string;
  path: string;
  contentType: string | null;
  bytes: number;
}

export class D2LClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly config: Config,
  ) {}

  private buildUrl(apiPath: string, query: Record<string, QueryValue> = {}): string {
    const url = new URL(apiPath, `${this.config.baseUrl}/`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.append(key, String(value));
    }
    return url.toString();
  }

  private async checkedResponse(
    apiPath: string,
    query: Record<string, QueryValue> = {},
  ): Promise<APIResponse> {
    const response = await this.request.get(this.buildUrl(apiPath, query), {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const status = response.status();
    const location = response.headers()["location"] ?? "";
    const contentType = response.headers()["content-type"] ?? "";

    if (
      status === 401 ||
      (status >= 300 && status < 400 && /login|saml|microsoftonline/i.test(location)) ||
      (status === 200 && contentType.includes("text/html") && /login/i.test(response.url()))
    ) {
      throw new AuthenticationRequiredError();
    }
    if (status === 403) {
      throw new ElearnError("eLearn denied access to this resource.", "FORBIDDEN", status);
    }
    if (status === 404) {
      throw new ElearnError("The requested eLearn resource was not found.", "NOT_FOUND", status, {
        apiPath,
      });
    }
    if (status === 429) {
      throw new ElearnError("The eLearn API rate limit was reached. Retry later.", "RATE_LIMITED", status);
    }
    if (status < 200 || status >= 300) {
      throw new ElearnError(`eLearn returned HTTP ${status}.`, "UPSTREAM_ERROR", status, { apiPath });
    }
    return response;
  }

  private async getJson<T>(
    apiPath: string,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    const response = await this.checkedResponse(apiPath, query);
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("json")) {
      throw new AuthenticationRequiredError(
        "eLearn returned a web page instead of API data. Re-authenticate with `npm run auth`.",
      );
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new ElearnError("eLearn returned invalid JSON.", "INVALID_UPSTREAM_RESPONSE", undefined, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async whoAmI(): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>(
      `/d2l/api/lp/${encodeURIComponent(this.config.lpVersion)}/users/whoami`,
    );
  }

  private async listEnrollmentRecords(): Promise<D2LMyOrgUnitInfo[]> {
    const records: D2LMyOrgUnitInfo[] = [];
    const seenBookmarks = new Set<string>();
    let bookmark: string | undefined;

    for (let page = 0; page < 1000; page += 1) {
      const result = await this.getJson<D2LPagedResult<D2LMyOrgUnitInfo>>(
        `/d2l/api/lp/${encodeURIComponent(this.config.lpVersion)}/enrollments/myenrollments/`,
        {
          orgUnitTypeId: this.config.courseOrgUnitTypeId,
          bookmark,
        },
      );
      records.push(...(result.Items ?? []));
      if (!result.PagingInfo?.HasMoreItems) break;
      const nextBookmark = result.PagingInfo.Bookmark ?? undefined;
      if (!nextBookmark || seenBookmarks.has(nextBookmark)) {
        throw new ElearnError("eLearn returned an invalid pagination bookmark.", "INVALID_PAGINATION");
      }
      seenBookmarks.add(nextBookmark);
      bookmark = nextBookmark;
    }
    return records;
  }

  async listCourses(options: ListCoursesOptions = {}): Promise<Course[]> {
    const query = options.search?.trim().toLowerCase();
    let courses = (await this.listEnrollmentRecords()).map((item): Course => ({
      id: item.OrgUnit.Id,
      name: item.OrgUnit.Name,
      code: item.OrgUnit.Code ?? null,
      homeUrl: new URL(item.OrgUnit.HomeUrl ?? `/d2l/home/${item.OrgUnit.Id}`, this.config.baseUrl).toString(),
      isPinned: item.PinDate !== null && item.PinDate !== undefined,
      pinDate: item.PinDate ?? null,
      isActive: item.Access?.IsActive ?? true,
      canAccess: item.Access?.CanAccess ?? true,
      startDate: item.Access?.StartDate ?? null,
      endDate: item.Access?.EndDate ?? null,
      lastAccessed: item.Access?.LastAccessed ?? null,
      roleName: item.Access?.ClasslistRoleName ?? null,
    }));

    if (options.activeOnly ?? true) courses = courses.filter((course) => course.isActive && course.canAccess);
    if (options.pinnedOnly) courses = courses.filter((course) => course.isPinned);
    if (query) {
      courses = courses.filter(
        (course) => course.name.toLowerCase().includes(query) || course.code?.toLowerCase().includes(query),
      );
    }
    courses.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.pinDate && b.pinDate) return b.pinDate.localeCompare(a.pinDate);
      return a.name.localeCompare(b.name);
    });
    return options.limit === undefined ? courses : courses.slice(0, options.limit);
  }

  async getEvents(courseId: number, since: string, until: string): Promise<CalendarEvent[]> {
    const endpoint = `/d2l/api/le/${encodeURIComponent(this.config.leVersion)}/${courseId}/calendar/events/myEvents/`;
    let next: string | null = this.buildUrl(endpoint, { startDateTime: since, endDateTime: until });
    const seen = new Set<string>();
    const events: CalendarEvent[] = [];
    while (next) {
      const url = new URL(next, this.config.baseUrl);
      if (url.origin !== new URL(this.config.baseUrl).origin || url.pathname !== endpoint || url.username || url.password || seen.has(url.href) || seen.size >= 100) {
        throw new ElearnError("Invalid calendar pagination link.", "INVALID_PAGINATION");
      }
      seen.add(url.href);
      const page: { Objects: CalendarEvent[]; Next?: string | null } = await this.getJson(url.href);
      if (!Array.isArray(page.Objects) || (page.Next != null && typeof page.Next !== "string")) {
        throw new ElearnError("eLearn returned an invalid calendar page.", "INVALID_UPSTREAM_RESPONSE");
      }
      events.push(...page.Objects);
      next = page.Next || null;
    }
    return events;
  }

  async getAnnouncements(courseId: number): Promise<Announcement[]> {
    const items = await this.getJson<Announcement[]>(
      `/d2l/api/le/${encodeURIComponent(this.config.leVersion)}/${courseId}/news/`,
    );
    if (!Array.isArray(items)) {
      throw new ElearnError("eLearn returned an invalid announcement list.", "INVALID_UPSTREAM_RESPONSE");
    }
    return items;
  }

  async getTableOfContents(courseId: number): Promise<D2LTableOfContents> {
    return this.getJson<D2LTableOfContents>(
      `/d2l/api/le/${encodeURIComponent(this.config.leVersion)}/${courseId}/content/toc`,
    );
  }

  async getContentObject(courseId: number, topicId: number): Promise<D2LContentObject> {
    return this.getJson<D2LContentObject>(
      `/d2l/api/le/${encodeURIComponent(this.config.leVersion)}/${courseId}/content/topics/${topicId}`,
    );
  }

  async downloadTopic(
    courseId: number,
    topicId: number,
    destinationDir: string,
    preferredFilename?: string,
    fallbackFilename?: string,
  ): Promise<DownloadResult> {
    const response = await this.checkedResponse(
      `/d2l/api/le/${encodeURIComponent(this.config.leVersion)}/${courseId}/content/topics/${topicId}/file`,
    );
    const body = await response.body();
    const headers = response.headers();
    const suggested =
      preferredFilename ??
      filenameFromDisposition(headers["content-disposition"]) ??
      fallbackFilename ??
      `topic-${topicId}`;
    const filename = sanitizeFilename(suggested);
    await fs.mkdir(destinationDir, { recursive: true });
    const outputPath = await uniqueFilePath(destinationDir, filename);
    await fs.writeFile(outputPath, body, { flag: "wx" });

    return {
      courseId,
      topicId,
      filename: path.basename(outputPath),
      path: outputPath,
      contentType: headers["content-type"] ?? null,
      bytes: body.byteLength,
    };
  }
}

function filenameFromDisposition(value: string | undefined): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(value)?.[1] ?? null;
}

function sanitizeFilename(value: string): string {
  const basename = path.basename(value).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return basename || "download";
}

async function uniqueFilePath(directory: string, filename: string): Promise<string> {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = path.join(directory, `${stem}${suffix}${extension}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new ElearnError("Unable to allocate a unique download filename.", "DOWNLOAD_PATH_EXHAUSTED");
}
