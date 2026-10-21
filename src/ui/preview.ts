import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { fileType, singaporeDate } from "../browser-model.js";
import type { DownloadPreview } from "../download-preview.js";
import type { BatchDownloadItem } from "../browser-service.js";
const app = new App({ name: "eLearn download preview", version: "0.3.0" });
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const btn = (id: string) => el<HTMLButtonElement>(id);
const key = (item: { courseId: number; topicId: number }) =>
  `${item.courseId}:${item.topicId}`;
let preview: DownloadPreview | undefined;
let selected = new Set<string>();
let saved = new Set<string>();
let busy = false;
let connected = false;
function status(message: string, error = false) {
  el("preview-status").textContent = message;
  el("preview-status").dataset.error = String(error);
}
function payload(result: {
  structuredContent?: Record<string, unknown> | undefined;
  isError?: boolean | undefined;
  content?: unknown;
}) {
  let data = result.structuredContent;
  if (!data && Array.isArray(result.content)) {
    try {
      data = JSON.parse(
        result.content.find((item) => item.type === "text")?.text ?? "{}",
      );
    } catch {}
  }
  if (result.isError || data?.error)
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Unable to complete this request.",
    );
  if (!data) throw new Error("No preview data returned.");
  return data;
}
function controls() {
  btn("preview-confirm").disabled = busy || !connected || !selected.size;
  btn("preview-confirm").textContent = busy
    ? "Please wait…"
    : selected.size
      ? `Confirm ${selected.size} download${selected.size === 1 ? "" : "s"}`
      : "Confirm downloads";
  btn("preview-clear").disabled = busy || !selected.size;
  btn("preview-refresh").disabled = busy || !connected || !preview;
  el("preview-selected").textContent =
    `${selected.size} file${selected.size === 1 ? "" : "s"} selected`;
  const pending =
    preview?.documents.filter((item) => !saved.has(key(item))) ?? [];
  const all = el<HTMLInputElement>("preview-select-all");
  all.disabled = busy || !pending.length;
  all.checked =
    pending.length > 0 && pending.every((item) => selected.has(key(item)));
  all.indeterminate = selected.size > 0 && !all.checked;
}
function render() {
  const container = el("preview-documents");
  container.replaceChildren();
  for (const item of preview?.documents ?? []) {
    const row = document.createElement("div");
    row.className = "document";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selected.has(key(item));
    check.disabled = busy || saved.has(key(item));
    check.setAttribute(
      "aria-label",
      `Download ${item.title} from ${item.courseName}`,
    );
    check.addEventListener("change", () => {
      if (check.checked && selected.size >= 50) {
        check.checked = false;
        status(
          "Confirm this batch first; a batch can contain up to 50 files.",
          true,
        );
        return;
      }
      check.checked ? selected.add(key(item)) : selected.delete(key(item));
      controls();
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
    meta.textContent = `${item.courseName} · ${item.modulePath.join(" / ")} · ${singaporeDate(item.lastModifiedDate) || "Date unavailable"}${saved.has(key(item)) ? " · Saved" : ""}`;
    info.append(title, meta);
    const open = document.createElement("button");
    open.className = "open-document";
    open.textContent = "↗";
    open.setAttribute("aria-label", `Open ${item.title} in eLearn`);
    open.onclick = async () => {
      try {
        const result = await app.openLink({ url: item.webUrl });
        if (result.isError)
          throw new Error("The host could not open this link.");
      } catch (error) {
        status(String(error), true);
      }
    };
    row.append(check, icon, info, open);
    container.append(row);
  }
  if (!preview?.documents.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "No downloadable files match this request. Try another search, date range, or course.";
    container.append(empty);
  }
  controls();
}
function accept(value: Record<string, unknown>) {
  if (typeof value.previewId !== "string" || !Array.isArray(value.documents))
    throw new Error("The server did not return a download preview.");
  preview = value as unknown as DownloadPreview;
  saved.clear();
  selected = new Set(preview.documents.slice(0, 50).map(key));
  el("preview-description").textContent = preview.description;
  el("preview-destination").textContent =
    `Download destination: ${preview.downloadDirectory}`;
  el("preview-count").textContent =
    `${preview.documents.length} matching files`;
  el("preview-warnings").textContent = [
    ...preview.warnings,
    ...(preview.omitted
      ? [
          `${preview.omitted} further matches are not shown. Narrow your search to review them.`,
        ]
      : []),
  ].join(" ");
  el("preview-expiry").textContent =
    `Preview valid until ${new Date(preview.expiresAt).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" })} SGT`;
  el("preview-results").hidden = true;
  status(
    preview.documents.length > 50
      ? "The first 50 files are selected. Confirm each additional batch separately."
      : "Ready for your review. No files have been downloaded.",
  );
  render();
}
btn("preview-clear").onclick = () => {
  selected.clear();
  render();
};
el("preview-select-all").onchange = () => {
  selected = el<HTMLInputElement>("preview-select-all").checked
    ? new Set(
        (preview?.documents ?? [])
          .filter((item) => !saved.has(key(item)))
          .slice(0, 50)
          .map(key),
      )
    : new Set();
  render();
};
btn("preview-refresh").onclick = async () => {
  if (!preview || busy) return;
  busy = true;
  render();
  status("Refreshing the matching files…");
  try {
    accept(
      payload(
        await app.callServerTool(
          {
            name: "elearn_preview_downloads",
            arguments: { ...preview.request },
          },
          { timeout: 120000 },
        ),
      ),
    );
  } catch (error) {
    status(String(error), true);
  } finally {
    busy = false;
    render();
  }
};
btn("preview-confirm").onclick = async () => {
  if (!preview || busy || !selected.size) return;
  const documents = preview.documents
    .filter((item) => selected.has(key(item)))
    .map(({ courseId, topicId }) => ({ courseId, topicId }));
  busy = true;
  render();
  status(`Downloading ${documents.length} confirmed files…`);
  try {
    const data = payload(
      await app.callServerTool(
        {
          name: "elearn_confirm_downloads",
          arguments: { previewId: preview.previewId, documents },
        },
        { timeout: 400000 },
      ),
    );
    el("preview-result-list").replaceChildren();
    for (const item of data.results as BatchDownloadItem[]) {
      const li = document.createElement("li");
      const title =
        preview.documents.find((document) => key(document) === key(item))
          ?.title ?? key(item);
      li.textContent = item.success
        ? `Saved ${item.download.filename} → ${item.download.path}`
        : `${title}: ${item.error}`;
      if (item.success) {
        saved.add(key(item));
        selected.delete(key(item));
      } else li.className = "error-text";
      el("preview-result-list").append(li);
    }
    el("preview-results").hidden = false;
    status(
      `${data.succeeded} saved · ${data.failed} failed. ${Number(data.failed) ? "Failed files remain selected for retry." : "Saved files are no longer selectable in this preview."}`,
      Number(data.failed) > 0,
    );
  } catch (error) {
    status(
      `${String(error)} No additional downloads will start automatically.`,
      true,
    );
  } finally {
    busy = false;
    render();
  }
};
function theme() {
  const context = app.getHostContext();
  if (context?.theme) {
    applyDocumentTheme(context.theme);
    document.documentElement.className = context.theme;
  }
  if (context?.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
}
app.onhostcontextchanged = theme;
app.ontoolresult = (result) => {
  try {
    accept(payload(result));
  } catch (error) {
    status(String(error), true);
  }
};
app.ontoolcancelled = () =>
  status("Preview cancelled. Ask to prepare the preview again.");
try {
  await app.connect();
  connected = true;
  theme();
  controls();
} catch {
  status("Open this download preview from the eLearn plugin.", true);
}
