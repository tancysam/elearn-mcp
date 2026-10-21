import type {
  CourseDocument,
  CourseWeek,
  D2LModule,
  D2LTableOfContents,
  D2LTopic,
} from "./types.js";

const DOCUMENT_EXTENSION = /\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|rtf|odt|ods|odp|zip|7z|rar|bpmn|drawio|ipynb|md)(?:$|[?#])/i;
const WEEK_TITLE = /\b(?:week|wk|w)\s*[-_:]?\s*0*(\d{1,2})\b/i;

export interface DocumentExtractionOptions {
  includeLinks?: boolean;
  includeHidden?: boolean;
}

export function parseWeekNumber(title: string): number | null {
  const match = WEEK_TITLE.exec(title);
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) ? value : null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function moduleMatchesWeek(module: D2LModule, week: number | string): boolean {
  if (typeof week === "number") return parseWeekNumber(module.Title) === week;

  const trimmed = week.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    return parseWeekNumber(module.Title) === Number.parseInt(trimmed, 10);
  }

  const expectedWeek = parseWeekNumber(trimmed);
  if (expectedWeek !== null) return parseWeekNumber(module.Title) === expectedWeek;

  const query = normalize(trimmed);
  return query.length > 0 && normalize(module.Title).includes(query);
}

export function isFileTopic(topic: D2LTopic): boolean {
  if (topic.ActivityType === 1) return true;
  if (topic.TypeIdentifier?.toLowerCase().includes("file")) return true;
  return DOCUMENT_EXTENSION.test(topic.Url ?? topic.Title);
}

export function isLinkTopic(topic: D2LTopic): boolean {
  return topic.ActivityType === 2 || topic.TypeIdentifier?.toLowerCase().includes("link") === true;
}

function topicToDocument(
  courseId: number,
  module: D2LModule,
  modulePath: string[],
  topic: D2LTopic,
  courseName?: string,
): CourseDocument {
  const result: CourseDocument = {
    courseId,
    moduleId: module.ModuleId,
    moduleTitle: module.Title,
    modulePath,
    topicId: topic.TopicId,
    title: topic.Title,
    url: topic.Url ?? null,
    typeIdentifier: topic.TypeIdentifier ?? null,
    activityType: topic.ActivityType ?? null,
    isFile: isFileTopic(topic),
    isLink: isLinkTopic(topic),
    isHidden: topic.IsHidden ?? false,
    isLocked: topic.IsLocked ?? false,
    isBroken: topic.IsBroken ?? false,
    startDate: topic.StartDateTime ?? null,
    endDate: topic.EndDateTime ?? null,
    dueDate: topic.DueDate ?? null,
    lastModifiedDate: topic.LastModifiedDate ?? null,
    webUrl: `https://elearn.smu.edu.sg/d2l/le/lessons/${courseId}/topics/${topic.TopicId}`,
  };
  if (courseName !== undefined) result.courseName = courseName;
  return result;
}

function collectDocumentsFromModule(
  courseId: number,
  module: D2LModule,
  parentPath: string[],
  options: DocumentExtractionOptions,
  output: CourseDocument[],
  courseName?: string,
): void {
  const currentPath = [...parentPath, module.Title];
  for (const topic of module.Topics ?? []) {
    if (!options.includeHidden && topic.IsHidden) continue;
    const isFile = isFileTopic(topic);
    if (!isFile && !(options.includeLinks && isLinkTopic(topic))) continue;
    output.push(topicToDocument(courseId, module, currentPath, topic, courseName));
  }

  for (const child of module.Modules ?? []) {
    collectDocumentsFromModule(courseId, child, currentPath, options, output, courseName);
  }
}

export function getAllDocuments(
  courseId: number,
  toc: D2LTableOfContents,
  options: DocumentExtractionOptions = {},
  courseName?: string,
): CourseDocument[] {
  const output: CourseDocument[] = [];
  for (const module of toc.Modules ?? []) {
    collectDocumentsFromModule(courseId, module, [], options, output, courseName);
  }
  return deduplicateDocuments(output);
}

export function getDocumentsForWeek(
  courseId: number,
  toc: D2LTableOfContents,
  week: number | string,
  options: DocumentExtractionOptions = {},
  courseName?: string,
): CourseDocument[] {
  const output: CourseDocument[] = [];

  function visit(module: D2LModule, parentPath: string[]): void {
    if (moduleMatchesWeek(module, week)) {
      collectDocumentsFromModule(courseId, module, parentPath, options, output, courseName);
      return;
    }
    const currentPath = [...parentPath, module.Title];
    for (const child of module.Modules ?? []) visit(child, currentPath);
  }

  for (const module of toc.Modules ?? []) visit(module, []);
  return deduplicateDocuments(output);
}

function deduplicateDocuments(documents: CourseDocument[]): CourseDocument[] {
  const seen = new Set<number>();
  return documents.filter((document) => {
    if (seen.has(document.topicId)) return false;
    seen.add(document.topicId);
    return true;
  });
}

export function listCourseWeeks(
  courseId: number,
  toc: D2LTableOfContents,
  options: DocumentExtractionOptions = {},
): CourseWeek[] {
  const weeks: CourseWeek[] = [];

  function visit(module: D2LModule, parentPath: string[]): void {
    const currentPath = [...parentPath, module.Title];
    const weekNumber = parseWeekNumber(module.Title);
    if (weekNumber !== null) {
      const documents: CourseDocument[] = [];
      collectDocumentsFromModule(courseId, module, parentPath, options, documents);
      weeks.push({
        courseId,
        moduleId: module.ModuleId,
        title: module.Title,
        weekNumber,
        path: currentPath,
        startDate: module.StartDateTime ?? null,
        endDate: module.EndDateTime ?? null,
        lastModifiedDate: module.LastModifiedDate ?? null,
        documentCount: deduplicateDocuments(documents).length,
      });
      return;
    }
    for (const child of module.Modules ?? []) visit(child, currentPath);
  }

  for (const module of toc.Modules ?? []) visit(module, []);
  return weeks.sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0) || a.title.localeCompare(b.title));
}

export function filterDocumentsByModifiedDate(
  documents: CourseDocument[],
  since: Date,
  until: Date,
): CourseDocument[] {
  const start = since.getTime();
  const end = until.getTime();
  return documents.filter((document) => {
    if (!document.lastModifiedDate) return false;
    const timestamp = Date.parse(document.lastModifiedDate);
    return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
  });
}

export function startOfLocalWeek(now = new Date()): Date {
  const result = new Date(now);
  const day = result.getDay();
  const daysSinceMonday = (day + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfLocalWeek(now = new Date()): Date {
  const result = startOfLocalWeek(now);
  result.setDate(result.getDate() + 7);
  result.setMilliseconds(result.getMilliseconds() - 1);
  return result;
}
