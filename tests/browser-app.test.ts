import { afterEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCourseBrowser } from "../src/browser-app.js";
import { loadConfig } from "../src/config.js";
import type { D2LClient } from "../src/d2l-client.js";
import { AuthenticationRequiredError } from "../src/errors.js";

const connections: Client[] = [];
afterEach(async () => {
  await Promise.all(connections.splice(0).map((client) => client.close()));
});
async function setup(getClient: () => Promise<D2LClient>) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerCourseBrowser(server, getClient, loadConfig());
  const client = new Client({ name: "test", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left);
  await client.connect(right);
  connections.push(client);
  return client;
}
describe("browser MCP contract", () => {
  it("registers both navigation entrypoints and returns structured launch errors", async () => {
    const client = await setup(async () => {
      throw new AuthenticationRequiredError();
    });
    const tools = await client.listTools();
    const opener = tools.tools.find(
      (tool) => tool.name === "elearn_open_course_browser",
    );
    expect(opener?._meta?.["openai/ui"]).toMatchObject({
      entrypoints: [{ type: "global" }, { type: "thread" }],
    });
    expect(
      tools.tools.find((tool) => tool.name === "elearn_confirm_downloads")
        ?._meta?.ui,
    ).toMatchObject({ visibility: ["app"] });
    expect(
      tools.tools.find((tool) => tool.name === "elearn_download_documents")
        ?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    const result = await client.callTool({
      name: "elearn_open_course_browser",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: "AUTHENTICATION_REQUIRED",
    });
  });
  it("rejects empty, oversized and invalid batch selections before accessing eLearn", async () => {
    let accessed = false;
    const client = await setup(async () => {
      accessed = true;
      throw new Error("Unexpected call");
    });
    for (const documents of [
      [],
      [{ courseId: -1, topicId: 1 }],
      Array.from({ length: 51 }, () => ({ courseId: 1, topicId: 1 })),
    ]) {
      const result = await client.callTool({
        name: "elearn_download_documents",
        arguments: { documents },
      });
      expect(result.isError).toBe(true);
    }
    expect(accessed).toBe(false);
  });
});
