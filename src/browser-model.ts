import type { CourseDocument, CourseWeek } from "./types.js";

export interface BrowserDocument extends CourseDocument {
  moduleIds: number[];
}

export interface CourseBrowserData {
  courseId: number;
  weeks: CourseWeek[];
  documents: BrowserDocument[];
}

export interface DocumentFilters {
  moduleId: number | null;
  query: string;
  fileType: string;
  since: string;
  until: string;
}

export function fileType(document: CourseDocument): string {
  if (document.isLink || !document.isFile) return "link";
  for (const value of [document.url, document.title]) {
    if (!value) continue;
    const match = /\.([a-z0-9]{1,10})(?:[?#].*)?$/i.exec(value);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return "file";
}

/** Date controls and displayed dates consistently use Singapore calendar days. */
export function singaporeDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function filterBrowserDocuments(
  documents: BrowserDocument[],
  filters: DocumentFilters,
): BrowserDocument[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return documents.filter((document) => {
    if (
      filters.moduleId !== null &&
      !document.moduleIds.includes(filters.moduleId)
    )
      return false;
    if (
      query &&
      !`${document.title} ${document.modulePath.join(" ")}`
        .toLocaleLowerCase()
        .includes(query)
    )
      return false;
    if (filters.fileType && fileType(document) !== filters.fileType)
      return false;
    const date = singaporeDate(document.lastModifiedDate);
    if ((filters.since || filters.until) && !date) return false;
    return (
      (!filters.since || date >= filters.since) &&
      (!filters.until || date <= filters.until)
    );
  });
}

export function canDownload(document: CourseDocument): boolean {
  return (
    document.isFile &&
    !document.isLink &&
    !document.isHidden &&
    !document.isLocked &&
    !document.isBroken
  );
}
