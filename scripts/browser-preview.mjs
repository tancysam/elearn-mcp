// Development-only MCP Apps host. Uses fixtures; never authenticates or writes downloads.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCourseBrowser } from "../dist/src/browser-app.js";
import { loadConfig } from "../dist/src/config.js";

const courses = [
  {
    id: 1,
    code: "IS216 · WAD2",
    name: "Web Application Development II",
    isPinned: true,
  },
  {
    id: 2,
    code: "IS115 · Algo",
    name: "Algorithms & Programming",
    isPinned: true,
  },
  {
    id: 3,
    code: "IS211 · IDP",
    name: "Interaction Design & Prototyping",
    isPinned: true,
  },
  {
    id: 4,
    code: "IS210 · BPAS",
    name: "Business Process Analysis & Solutioning",
    isPinned: false,
  },
].map((course) => ({
  ...course,
  homeUrl: `https://elearn.smu.edu.sg/d2l/home/${course.id}`,
}));
const topic = (id, title, modified, extra = {}) => ({
  TopicId: id,
  Title: title,
  Url: `/files/${title}`,
  ActivityType: 1,
  LastModifiedDate: modified,
  ...extra,
});
const toc = {
  Modules: [
    {
      ModuleId: 100,
      Title: "Course information",
      Topics: [topic(1, "Course outline.pdf", "2026-08-17T01:00:00Z")],
    },
    {
      ModuleId: 106,
      Title: "Week 6 · JavaScript & the DOM",
      Topics: [
        topic(2, "JavaScript and the DOM.pdf", "2026-10-05T02:30:00Z"),
        topic(3, "DOM practice exercises.zip", "2026-10-06T08:00:00Z"),
      ],
      Modules: [
        {
          ModuleId: 206,
          Title: "Lab materials",
          Topics: [
            topic(4, "Lab 6 — Event handling.pptx", "2026-10-06T16:30:00Z"),
            topic(5, "Additional reading", null, {
              ActivityType: 2,
              Url: "https://example.com",
            }),
          ],
        },
      ],
    },
    {
      ModuleId: 107,
      Title: "Week 7 · Asynchronous JavaScript",
      Topics: [
        topic(6, "Promises and async await.pdf", "2026-10-07T03:00:00Z"),
        topic(7, "Starter code.zip", "2026-10-07T04:00:00Z"),
        topic(8, "Upcoming lab.pdf", null, { IsLocked: true }),
      ],
    },
  ],
};
const fixture = {
  listCourses: async (options = {}) =>
    courses.filter((course) => !options.pinnedOnly || course.isPinned),
  getTableOfContents: async (id) => {
    await new Promise((resolve) => setTimeout(resolve, id === 2 ? 650 : 80));
    if (id === 3) return { Modules: [] };
    return toc;
  },
  downloadTopic: async (courseId, topicId) => {
    if (topicId === 3)
      throw new Error(
        "Preview: this file is unavailable. Other files were saved.",
      );
    return {
      courseId,
      topicId,
      filename: `document-${topicId}.pdf`,
      path: `/preview/downloads/document-${topicId}.pdf`,
      bytes: 1234,
      contentType: "application/pdf",
    };
  },
};
const server = new McpServer({ name: "fixture", version: "1.0.0" });
registerCourseBrowser(server, async () => fixture, {
  ...loadConfig(),
  downloadDir: "/preview/downloads",
});
const client = new Client({ name: "preview", version: "1.0.0" });
const [left, right] = InMemoryTransport.createLinkedPair();
await server.connect(left);
await client.connect(right);
const hostBuild = await build({
  stdin: {
    contents: `
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.querySelector("iframe");
const bridge = new AppBridge(null, { name: "eLearn fixture host", version: "1.0.0" }, { openLinks: {}, serverTools: {}, logging: {} }, { hostContext: { theme: "light", displayMode: "fullscreen", availableDisplayModes: ["fullscreen"], platform: "web" } });
window.previewCalls = []; window.previewLinks = [];
bridge.oncalltool = async (params) => {
  window.previewCalls.push(params);
  const response = await fetch("/tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  return response.json();
};
bridge.onopenlink = async ({ url }) => { window.previewLinks.push(url); document.querySelector("#last-link").textContent = url; return {}; };
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} });
  const result = new URLSearchParams(location.search).has("auth")
    ? { isError: true, content: [], structuredContent: { error: "AUTHENTICATION_REQUIRED", message: "Your eLearn session has expired. Sign in to continue." } }
    : await bridge.oncalltool({ name: new URLSearchParams(location.search).has("preview") ? "elearn_preview_downloads" : "elearn_open_course_browser", arguments: new URLSearchParams(location.search).has("preview") ? { ...(new URLSearchParams(location.search).get("query") ? {query: new URLSearchParams(location.search).get("query")} : {}), period: "this_week" } : {} });
  await bridge.sendToolResult(result);
};
document.querySelector("#theme").onclick = () => { const dark = document.querySelector("#theme").textContent === "Dark mode"; bridge.setHostContext({ theme: dark ? "dark" : "light", displayMode: "fullscreen", availableDisplayModes: ["fullscreen"] }); document.querySelector("#theme").textContent = dark ? "Light mode" : "Dark mode"; };
document.querySelector("#narrow").onclick = () => { frame.style.width = frame.style.width === "390px" ? "100%" : "390px"; };
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src = new URLSearchParams(location.search).has("preview") ? "/app-preview" : "/app";
`,
    resolveDir: process.cwd(),
    sourcefile: "preview-host.js",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const html = `<!doctype html><html><head><meta charset="utf-8"><title>eLearn browser — fixture preview</title><style>body{margin:0;background:#edf0f4;font:13px system-ui}header{padding:10px 16px;display:flex;gap:12px;align-items:center}iframe{display:block;border:1px solid #ddd;background:white;width:100%;height:calc(100vh - 48px);box-sizing:border-box;margin:auto}button{padding:5px 10px}#last-link{font-size:11px}</style></head><body><header><strong>Fixture preview · no real downloads</strong><button id="theme">Dark mode</button><button id="narrow">Toggle narrow panel</button><span id="last-link"></span></header><iframe title="Course browser" sandbox="allow-scripts allow-same-origin"></iframe><script type="module" src="/host.js"></script></body></html>`;
const listener = http.createServer(async (request, response) => {
  try {
    if (request.url === "/tool" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16384) throw new Error("Request too large");
      }
      const args = JSON.parse(body);
      const result =
        args.name === "elearn_authenticate"
          ? { content: [], structuredContent: { authenticated: true } }
          : await client.callTool(args);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    } else if (request.url === "/host.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(hostBuild.outputFiles[0].text);
    } else if (request.url === "/app" || request.url === "/app-preview") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        await readFile(
          new URL(
            request.url === "/app-preview"
              ? "../dist/ui/download-preview.html"
              : "../dist/ui/course-browser.html",
            import.meta.url,
          ),
        ),
      );
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    }
  } catch (error) {
    response.statusCode = 500;
    response.end(
      JSON.stringify({
        isError: true,
        content: [{ type: "text", text: error.message }],
      }),
    );
  }
});
listener.listen(4178, "127.0.0.1", () =>
  console.log(
    "Fixture preview: http://127.0.0.1:4178 (no authentication or real downloads)",
  ),
);
