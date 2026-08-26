#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedTools = [
  "elearn_authenticate",
  "elearn_auth_status",
  "elearn_list_courses",
  "elearn_list_pinned_courses",
  "elearn_list_course_weeks",
  "elearn_get_week_documents",
  "elearn_get_recent_documents",
  "elearn_get_course_documents",
  "elearn_search_content",
  "elearn_get_document_metadata",
  "elearn_download_document",
].sort();
const pluginServers = [
  {
    client: "Codex",
    path: path.join(
      projectRoot,
      "plugin-package",
      "codex",
      "smu-elearn",
      "mcp",
      "dist",
      "src",
      "server.js",
    ),
  },
  {
    client: "Claude",
    path: path.join(
      projectRoot,
      "plugin-package",
      "claude",
      "smu-elearn",
      "mcp",
      "dist",
      "src",
      "server.js",
    ),
  },
];

for (const pluginServer of pluginServers) {
  const client = new Client({
    name: `${pluginServer.client.toLowerCase()}-plugin-smoke-test`,
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [pluginServer.path],
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const toolList = await client.listTools();
    const names = toolList.tools.map((tool) => tool.name).sort();
    assert.deepEqual(
      names,
      expectedTools,
      `${pluginServer.client} plugin tool list did not match the expected contract`,
    );
    console.log(`${pluginServer.client} plugin MCP handshake passed (${names.length} tools)`);
  } finally {
    await client.close().catch(() => undefined);
  }
}
