import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import {
  canDownload,
  fileType,
  filterBrowserDocuments,
  singaporeDate,
  type BrowserDocument,
  type CourseBrowserData,
  type DocumentFilters,
} from "../browser-model.js";
import type { BatchDownloadItem } from "../browser-service.js";
import type { Course } from "../types.js";

const app = new App({ name: "SMU eLearn course browser", version: "0.3.0" });
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
const button = (id: string) => $<HTMLButtonElement>(id);
let courses: Course[] = [];
let course: Course | undefined;
let data: CourseBrowserData | undefined;
let pinnedOnly = true;
let selected = new Set<number>();
let loading = false;
let downloading = false;
let refreshing = false;
let connected = false;
let requestVersion = 0;
let downloadDirectory = "";

function notice(message = "", error = false): void {
  $("notice").textContent = message;
  $("notice").dataset.error = String(error);
}

function payload(result: {
  structuredContent?: Record<string, unknown> | undefined;
  content?: unknown;
  isError?: boolean | undefined;
}): Record<string, unknown> {
  let value = result.structuredContent;
  if (!value && Array.isArray(result.content)) {
    const text = result.content.find((item) => item.type === "text")?.text;
    if (typeof text === "string") {
      try {
        value = JSON.parse(text);
      } catch {
        /* Show fallback below. */
      }
    }
  }
  if (result.isError || value?.error) {
    if (
      value?.error === "AUTHENTICATION_REQUIRED" ||
      value?.error === "AUTH_STATE_MISSING"
    )
      $("connection").hidden = false;
    throw new Error(
      typeof value?.message === "string"
        ? value.message
        : "eLearn could not complete this request. Try refreshing or signing in again.",
    );
  }
  if (!value) throw new Error("eLearn returned no data. Try refreshing.");
  return value;
}

async function call(
  name: string,
  args: Record<string, unknown> = {},
  timeout = 120_000,
): Promise<Record<string, unknown>> {
  return payload(
    await app.callServerTool({ name, arguments: args }, { timeout }),
  );
}

function empty(container: HTMLElement, title: string, message: string): void {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const description = document.createElement("p");
  description.textContent = message;
  wrap.append(heading, description);
  container.replaceChildren(wrap);
}

function renderCourses(): void {
  const query = input("course-search").value.trim().toLowerCase();
  const visible = courses.filter(
    (item) =>
      (!pinnedOnly || item.isPinned) &&
      `${item.code ?? ""} ${item.name}`.toLowerCase().includes(query),
  );
  $("course-count").textContent = String(visible.length);
  button("pinned").setAttribute("aria-pressed", String(pinnedOnly));
  button("all-courses").setAttribute("aria-pressed", String(!pinnedOnly));
  $("courses").replaceChildren();
  for (const item of visible) {
    const row = document.createElement("button");
    row.className = "course";
    row.setAttribute("aria-current", String(item.id === course?.id));
    row.disabled = downloading || refreshing;
    const code = document.createElement("strong");
    code.textContent = item.code || `Course ${item.id}`;
    const name = document.createElement("span");
    name.textContent = item.name;
    row.append(code, name);
    row.addEventListener("click", () => void loadCourse(item));
    $("courses").append(row);
  }
  if (!visible.length)
    empty(
      $("courses"),
      "No courses found",
      pinnedOnly
        ? "Try All courses or change your search."
        : "Try a different course name.",
    );
}

function filters(): DocumentFilters {
  return {
    moduleId: select("week").value ? Number(select("week").value) : null,
    query: input("document-search").value,
    fileType: select("file-type").value,
    since: input("since").value,
    until: input("until").value,
  };
}

function visibleDocuments(): BrowserDocument[] {
  const values = filters();
  if (values.since && values.until && values.since > values.until) return [];
  return filterBrowserDocuments(data?.documents ?? [], values);
}

function renderSelection(): void {
  $("selection-count").textContent = selected.size
    ? `${selected.size} file${selected.size === 1 ? "" : "s"} selected`
    : "No files selected";
  $("destination").textContent = downloadDirectory
    ? `Save to ${downloadDirectory}`
    : "Select files to download them together.";
  button("download").disabled =
    !connected || loading || downloading || selected.size === 0;
  button("download").textContent = downloading
    ? "Downloading…"
    : "Download selected";
  button("clear-selection").disabled = !selected.size || downloading;
  const available = visibleDocuments().filter(canDownload);
  const count = available.filter((item) => selected.has(item.topicId)).length;
  input("select-all").checked =
    available.length > 0 && count === available.length;
  input("select-all").indeterminate = count > 0 && count < available.length;
  input("select-all").disabled = loading || downloading || !available.length;
}

async function openLink(url: string): Promise<void> {
  try {
    if (!/^https?:\/\//i.test(url))
      throw new Error("This item does not have a supported web link.");
    const result = await app.openLink({ url });
    if (result.isError)
      throw new Error("The host could not open this eLearn link.");
  } catch (error) {
    notice(
      error instanceof Error ? error.message : "Unable to open link.",
      true,
    );
  }
}

function renderDocuments(): void {
  const values = filters();
  const invalidDates = Boolean(
    values.since && values.until && values.since > values.until,
  );
  $("date-error").hidden = !invalidDates;
  const visible = visibleDocuments();
  $("document-count").textContent =
    `${visible.length} of ${data?.documents.length ?? 0} documents`;
  const container = $("documents");
  container.replaceChildren();
  container.setAttribute("aria-busy", String(loading));
  if (loading)
    empty(
      container,
      "Loading course materials…",
      "Retrieving the latest weeks and documents from eLearn.",
    );
  else if (!data)
    empty(
      container,
      course
        ? "Course materials unavailable"
        : "Your course materials, together",
      course
        ? "Refresh to try again, or open the course in eLearn."
        : "Choose a course to browse its weeks and documents.",
    );
  else if (!visible.length)
    empty(
      container,
      invalidDates ? "Check your date range" : "No documents match",
      data.documents.length
        ? "Adjust your filters to see more course materials."
        : "This course has no visible files or links yet.",
    );
  else
    for (const item of visible) {
      const row = document.createElement("div");
      row.className = "document";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(item.topicId);
      checkbox.disabled = !canDownload(item) || downloading;
      checkbox.setAttribute("aria-label", `Select ${item.title}`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked && selected.size >= 50) {
          checkbox.checked = false;
          notice("Select up to 50 files per download batch.", true);
          return;
        }
        checkbox.checked
          ? selected.add(item.topicId)
          : selected.delete(item.topicId);
        renderSelection();
      });
      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.textContent = fileType(item);
      const info = document.createElement("div");
      info.className = "document-info";
      const title = document.createElement("div");
      title.className = "document-title";
      title.textContent = item.title;
      const meta = document.createElement("div");
      meta.className = "document-meta";
      const date = singaporeDate(item.lastModifiedDate);
      const state = item.isLocked
        ? " · Locked"
        : item.isBroken
          ? " · Unavailable"
          : !item.isFile
            ? " · Web link"
            : "";
      meta.textContent = `${item.modulePath.join(" / ")} · ${date ? `Modified ${date}` : "Date unavailable"}${state}`;
      info.append(title, meta);
      const open = document.createElement("button");
      open.className = "open-document";
      open.textContent = "↗";
      open.setAttribute("aria-label", `Open ${item.title} in eLearn`);
      open.title = "Open in eLearn";
      open.addEventListener("click", () => void openLink(item.webUrl));
      row.append(checkbox, icon, info, open);
      container.append(row);
    }
  renderSelection();
}

function resetFilters(): void {
  for (const id of ["week", "file-type", "document-search", "since", "until"])
    input(id).value = "";
}

async function loadCourse(next: Course): Promise<void> {
  const version = ++requestVersion;
  course = next;
  data = undefined;
  selected.clear();
  loading = true;
  resetFilters();
  select("week").replaceChildren(new Option("All weeks & modules", ""));
  select("file-type").replaceChildren(new Option("All types", ""));
  $("download-results").hidden = true;
  $("document-controls").hidden = true;
  $("course-title").textContent = next.code || next.name;
  $("course-description").textContent = next.name;
  $("open-course").hidden = false;
  renderCourses();
  renderDocuments();
  notice(`Loading ${next.code || next.name}…`);
  try {
    const loaded = await call("elearn_browse_course", { courseId: next.id });
    if (version !== requestVersion) return;
    data = loaded as unknown as CourseBrowserData;
    for (const week of data.weeks)
      select("week").add(
        new Option(
          `${week.title} (${week.documentCount})`,
          String(week.moduleId),
        ),
      );
    for (const type of [...new Set(data.documents.map(fileType))].sort())
      select("file-type").add(
        new Option(type === "link" ? "Web links" : type.toUpperCase(), type),
      );
    $("document-controls").hidden = false;
    notice();
  } catch (error) {
    if (version === requestVersion)
      notice(
        error instanceof Error ? error.message : "Unable to load course.",
        true,
      );
  } finally {
    if (version === requestVersion) {
      loading = false;
      renderDocuments();
    }
  }
}

function acceptCourses(value: Record<string, unknown>): void {
  if (!Array.isArray(value.courses))
    throw new Error("eLearn returned an invalid course list.");
  courses = value.courses as Course[];
  downloadDirectory =
    typeof value.downloadDirectory === "string" ? value.downloadDirectory : "";
  $("connection").hidden = true;
  renderCourses();
  renderSelection();
  notice();
}

async function refresh(): Promise<void> {
  refreshing = true;
  renderCourses();
  button("refresh").disabled = true;
  notice("Refreshing courses…");
  const previous = course?.id;
  ++requestVersion;
  loading = true;
  data = undefined;
  selected.clear();
  renderDocuments();
  try {
    acceptCourses(await call("elearn_open_course_browser"));
    const next = courses.find((item) => item.id === previous);
    if (next) await loadCourse(next);
    else {
      course = undefined;
      $("course-title").textContent = "Choose a course";
      $("course-description").textContent =
        "Browse weekly materials and keep what you need.";
      $("document-controls").hidden = true;
      $("open-course").hidden = true;
      renderCourses();
    }
  } catch (error) {
    notice(error instanceof Error ? error.message : "Refresh failed.", true);
    $("connection").hidden = false;
  } finally {
    refreshing = false;
    renderCourses();
    loading = false;
    renderDocuments();
    button("refresh").disabled = false;
  }
}

async function download(): Promise<void> {
  const items = (data?.documents ?? []).filter((item) =>
    selected.has(item.topicId),
  );
  if (!items.length || downloading) return;
  downloading = true;
  button("refresh").disabled = true;
  renderCourses();
  renderDocuments();
  notice(`Downloading ${items.length} files…`);
  try {
    const value = await call(
      "elearn_download_documents",
      {
        documents: items.map(({ courseId, topicId }) => ({
          courseId,
          topicId,
        })),
      },
      600_000,
    );
    const results = value.results as BatchDownloadItem[];
    $("result-list").replaceChildren();
    for (const result of results) {
      const row = document.createElement("li");
      const name =
        items.find((item) => item.topicId === result.topicId)?.title ??
        `Topic ${result.topicId}`;
      row.textContent = result.success
        ? `Saved ${result.download.filename} → ${result.download.path}`
        : `${name}: ${result.error}`;
      if (result.success) selected.delete(result.topicId);
      else row.className = "error-text";
      $("result-list").append(row);
    }
    $("download-results").hidden = false;
    notice(
      `${value.succeeded} saved · ${value.failed} failed${Number(value.failed) ? ". Failed files remain selected for retry." : "."}`,
      Number(value.failed) > 0,
    );
  } catch (error) {
    notice(
      `${error instanceof Error ? error.message : "Download failed."} Check the destination before retrying; some files may already have been saved.`,
      true,
    );
  } finally {
    downloading = false;
    button("refresh").disabled = false;
    renderCourses();
    renderDocuments();
  }
}

input("course-search").addEventListener("input", renderCourses);
button("pinned").addEventListener("click", () => {
  pinnedOnly = true;
  renderCourses();
});
button("all-courses").addEventListener("click", () => {
  pinnedOnly = false;
  renderCourses();
});
for (const id of ["week", "file-type", "document-search", "since", "until"])
  $(id).addEventListener(
    id === "document-search" ? "input" : "change",
    renderDocuments,
  );
button("clear-filters").addEventListener("click", () => {
  resetFilters();
  renderDocuments();
});
button("clear-selection").addEventListener("click", () => {
  selected.clear();
  renderDocuments();
});
input("select-all").addEventListener("change", () => {
  const items = visibleDocuments().filter(canDownload);
  if (input("select-all").checked) {
    for (const item of items) {
      if (selected.size < 50) selected.add(item.topicId);
    }
    if (items.some((item) => !selected.has(item.topicId)))
      notice(
        "Selected up to 50 files. Download this batch before selecting more.",
      );
  } else for (const item of items) selected.delete(item.topicId);
  renderDocuments();
});
button("download").addEventListener("click", () => void download());
button("refresh").addEventListener("click", () => void refresh());
button("open-course").addEventListener("click", () => {
  if (course) void openLink(course.homeUrl);
});
button("authenticate").addEventListener("click", async () => {
  button("authenticate").disabled = true;
  notice(
    "Complete SMU sign-in and MFA in Chrome. This can take a few minutes.",
  );
  try {
    await call("elearn_authenticate", {}, 360_000);
    await refresh();
  } catch (error) {
    notice(error instanceof Error ? error.message : "Sign-in failed.", true);
  } finally {
    button("authenticate").disabled = false;
  }
});

function applyContext(context: ReturnType<App["getHostContext"]>): void {
  if (context?.theme) {
    applyDocumentTheme(context.theme);
    document.documentElement.classList.toggle("dark", context.theme === "dark");
    document.documentElement.classList.toggle(
      "light",
      context.theme === "light",
    );
  }
  if (context?.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
}
app.onhostcontextchanged = () => applyContext(app.getHostContext());
app.ontoolresult = (result) => {
  try {
    acceptCourses(payload(result));
  } catch (error) {
    notice(
      error instanceof Error ? error.message : "Unable to load eLearn.",
      true,
    );
    $("connection").hidden = false;
  }
};
app.ontoolcancelled = () =>
  notice("Loading was cancelled. Refresh to try again.");
try {
  await app.connect();
  connected = true;
  button("refresh").disabled = false;
  renderSelection();
  const context = app.getHostContext();
  applyContext(context);
  if (
    context?.displayMode !== "fullscreen" &&
    context?.availableDisplayModes?.includes("fullscreen")
  ) {
    await app.requestDisplayMode({ mode: "fullscreen" }).catch(() => undefined);
  }
} catch {
  notice(
    "Open the course browser from the SMU eLearn plugin in an MCP Apps-compatible host.",
    true,
  );
}
