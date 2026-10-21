import { describe, expect, it, vi, beforeEach } from "vitest";
import { browserChannel, configForBrowser, loadConfig } from "../src/config.js";
import { SessionManager } from "../src/session.js";

const mocks = vi.hoisted(() => {
  const context = {
    pages: () => [{ goto: async () => undefined }],
    storageState: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    request: {},
  };
  return {
    context,
    persistent: vi.fn(async () => context),
    launch: vi.fn(async () => ({
      newContext: async () => context,
      close: async () => undefined,
    })),
  };
});
vi.mock("playwright-core", () => ({ chromium: {
  launchPersistentContext: mocks.persistent,
  launch: mocks.launch,
} }));
vi.mock("node:fs/promises", () => ({ default: {
  mkdir: async () => undefined,
  access: async () => undefined,
  chmod: async () => undefined,
} }));
vi.mock("../src/d2l-client.js", () => ({ D2LClient: class {
  async whoAmI() { return { Identifier: 1 }; }
} }));

beforeEach(() => vi.clearAllMocks());

describe("browser selection", () => {
  it("defaults to Edge and rejects unsupported browsers", () => {
    expect(loadConfig({}).browser).toBe("edge");
    expect(() => loadConfig({ ELEARN_BROWSER: "safari" })).toThrow("edge or chrome");
  });

  it("isolates default profiles and state but preserves explicit paths", () => {
    const edge = loadConfig({});
    const chrome = configForBrowser(edge, "chrome");
    expect(chrome.profileDir).not.toBe(edge.profileDir);
    expect(chrome.authStateFile).not.toBe(edge.authStateFile);
    expect(configForBrowser(chrome, "edge")).toEqual(edge);
    const custom = loadConfig({ ELEARN_PROFILE_DIR: "/tmp/custom-profile", ELEARN_AUTH_STATE_FILE: "/tmp/custom-state" });
    expect(configForBrowser(custom, "chrome")).toMatchObject({ profileDir: custom.profileDir, authStateFile: custom.authStateFile });
  });

  it.each(["edge", "chrome"] as const)("uses %s for login and subsequent API sessions", async (browser) => {
    const manager = new SessionManager(loadConfig({}));
    const result = await manager.authenticateInteractively({ browser, initialWaitSeconds: 0 });
    expect(result.browser).toBe(browser);
    expect(mocks.persistent).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ channel: browserChannel(browser) }));
    await manager.client();
    expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({ channel: browserChannel(browser) }));
    await manager.close();
  });

  it("retains the prior browser after a failed browser switch", async () => {
    const manager = new SessionManager(loadConfig({}));
    mocks.persistent.mockRejectedValueOnce(new Error("Browser unavailable"));
    await expect(manager.authenticateInteractively({ browser: "chrome", initialWaitSeconds: 0 })).rejects.toThrow("Browser unavailable");
    await manager.client();
    expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({ channel: "msedge" }));
    await manager.close();
  });
});
