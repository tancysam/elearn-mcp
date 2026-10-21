import { getAllDocuments, listCourseWeeks } from "./content.js";
import { canDownload, type CourseBrowserData } from "./browser-model.js";
import type { D2LClient, DownloadResult } from "./d2l-client.js";
import type { D2LModule, D2LTableOfContents } from "./types.js";

export interface DocumentSelection {
  courseId: number;
  topicId: number;
}
export type BatchDownloadItem = DocumentSelection &
  (
    | { success: true; download: DownloadResult }
    | { success: false; error: string }
  );

export function courseBrowserData(
  courseId: number,
  toc: D2LTableOfContents,
  baseUrl: string,
): CourseBrowserData {
  const ancestry = new Map<number, number[]>();
  function visibleModules(
    modules: D2LModule[],
    parents: number[],
    locked = false,
  ): D2LModule[] {
    return modules
      .filter((module) => !module.IsHidden)
      .map((module) => {
        const ids = [...parents, module.ModuleId];
        ancestry.set(module.ModuleId, ids);
        const isLocked = locked || module.IsLocked === true;
        return {
          ...module,
          Topics: (module.Topics ?? []).map((topic) => ({
            ...topic,
            IsLocked: isLocked || topic.IsLocked === true,
          })),
          Modules: visibleModules(module.Modules ?? [], ids, isLocked),
        };
      });
  }
  const visibleToc = { Modules: visibleModules(toc.Modules ?? [], []) };
  const options = { includeLinks: true };
  return {
    courseId,
    weeks: listCourseWeeks(courseId, visibleToc, options),
    documents: getAllDocuments(courseId, visibleToc, options).map(
      (document) => ({
        ...document,
        moduleIds: ancestry.get(document.moduleId) ?? [],
        webUrl: new URL(
          `/d2l/le/lessons/${courseId}/topics/${document.topicId}`,
          baseUrl,
        ).toString(),
      }),
    ),
  };
}

/** Serial writes avoid filename races within a batch; each failure remains visible. */
export async function downloadDocuments(
  client: Pick<D2LClient, "getTableOfContents" | "downloadTopic">,
  selection: DocumentSelection[],
  destination: string,
  baseUrl: string,
): Promise<BatchDownloadItem[]> {
  const courses = new Map<number, Promise<CourseBrowserData>>();
  const seen = new Set<string>();
  const results: BatchDownloadItem[] = [];
  for (const item of selection) {
    const key = `${item.courseId}:${item.topicId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      let data = courses.get(item.courseId);
      if (!data) {
        data = client
          .getTableOfContents(item.courseId)
          .then((toc) => courseBrowserData(item.courseId, toc, baseUrl));
        courses.set(item.courseId, data);
      }
      const document = (await data).documents.find(
        (entry) => entry.topicId === item.topicId,
      );
      if (!document || !canDownload(document))
        throw new Error(
          "This item is not an available file. Open it in eLearn to check access.",
        );
      const download = await client.downloadTopic(
        item.courseId,
        item.topicId,
        destination,
        undefined,
        document.title,
      );
      results.push({ ...item, success: true, download });
    } catch (error) {
      results.push({
        ...item,
        success: false,
        error: error instanceof Error ? error.message : "Download failed.",
      });
    }
  }
  return results;
}
