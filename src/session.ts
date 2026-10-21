import fs from "node:fs/promises";
import type { Browser, BrowserContext } from "playwright-core";
import { chromium } from "playwright-core";
import { browserChannel, browserName, configForBrowser, type Config } from "./config.js";
import { AuthenticationRequiredError, ElearnError } from "./errors.js";
import { D2LClient } from "./d2l-client.js";
import {
  runInteractiveAuthentication,
  type InteractiveAuthenticationOptions,
  type InteractiveAuthenticationResult,
} from "./auth-flow.js";

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
}

export class SessionManager {
  private sessionPromise: Promise<BrowserSession> | null = null;

  constructor(private config: Config) {}

  private async createSession(): Promise<BrowserSession> {
    try {
      await fs.access(this.config.authStateFile);
    } catch {
      throw new AuthenticationRequiredError(
        "No saved eLearn session was found. Run `npm run auth` in the elearn-mcp directory.",
      );
    }

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        channel: browserChannel(this.config.browser),
        headless: this.config.headless,
      });
      const context = await browser.newContext({
        storageState: this.config.authStateFile,
        acceptDownloads: false,
        viewport: { width: 1280, height: 900 },
      });
      return { browser, context };
    } catch (error) {
      await browser?.close().catch(() => undefined);
      throw new ElearnError(
        `Could not start ${browserName(this.config.browser)} with the saved eLearn session. Make sure it is installed and rerun authentication if needed.`,
        "BROWSER_START_FAILED",
        undefined,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async client(): Promise<D2LClient> {
    this.sessionPromise ??= this.createSession();
    const session = await this.sessionPromise;
    return new D2LClient(session.context.request, this.config);
  }

  async authenticateInteractively(
    options: InteractiveAuthenticationOptions = {},
  ): Promise<InteractiveAuthenticationResult> {
    await this.close();
    const selectedConfig = options.browser ? configForBrowser(this.config, options.browser) : this.config;
    const result = await runInteractiveAuthentication(selectedConfig, options);
    this.config = selectedConfig;
    return result;
  }

  async close(): Promise<void> {
    const pending = this.sessionPromise;
    this.sessionPromise = null;
    if (!pending) return;
    const session = await pending.catch(() => null);
    if (!session) return;
    await session.context.close();
    await session.browser.close();
  }
}
