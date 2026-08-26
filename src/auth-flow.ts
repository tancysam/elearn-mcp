import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import type { Config } from "./config.js";
import { AuthenticationRequiredError, ElearnError } from "./errors.js";
import { D2LClient } from "./d2l-client.js";

export interface InteractiveAuthenticationOptions {
  initialWaitSeconds?: number;
  pollIntervalSeconds?: number;
  timeoutSeconds?: number;
  log?: (message: string) => void;
}

export interface InteractiveAuthenticationResult {
  authenticated: true;
  attempts: number;
  checkedAfterSeconds: number;
  authStateFile: string;
}

export async function runInteractiveAuthentication(
  config: Config,
  options: InteractiveAuthenticationOptions = {},
): Promise<InteractiveAuthenticationResult> {
  const initialWaitSeconds = options.initialWaitSeconds ?? 60;
  const pollIntervalSeconds = options.pollIntervalSeconds ?? 15;
  const timeoutSeconds = options.timeoutSeconds ?? 300;
  const log = options.log ?? (() => undefined);

  if (initialWaitSeconds < 0 || pollIntervalSeconds <= 0 || timeoutSeconds <= 0) {
    throw new ElearnError("Authentication timing values must be positive.", "INVALID_AUTH_TIMING");
  }
  if (initialWaitSeconds > timeoutSeconds) {
    throw new ElearnError(
      "Authentication timeout must be at least as long as the initial login wait.",
      "INVALID_AUTH_TIMING",
    );
  }

  await fs.mkdir(config.profileDir, { recursive: true });
  await fs.mkdir(path.dirname(config.authStateFile), { recursive: true });

  log("Opening a dedicated Google Chrome profile for SMU eLearn authentication...");
  log(`Profile: ${config.profileDir}`);

  const context = await chromium.launchPersistentContext(config.profileDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1_000;
  let attempts = 0;

  try {
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    await page.goto(`${config.baseUrl}/d2l/home`, { waitUntil: "domcontentloaded" });

    log("Complete the SMU Microsoft sign-in and MFA flow in Chrome.");
    log(`eLearn will be checked automatically after ${initialWaitSeconds} seconds.`);
    await delay(initialWaitSeconds * 1_000);

    const client = new D2LClient(context.request, config);
    while (true) {
      attempts += 1;
      try {
        await client.whoAmI();
        await context.storageState({ path: config.authStateFile, indexedDB: true });
        await fs.chmod(config.authStateFile, 0o600);
        const checkedAfterSeconds = Math.round((Date.now() - startedAt) / 1_000);
        log("Authentication verified against the eLearn API.");
        log(`Session state saved with owner-only permissions: ${config.authStateFile}`);
        log("The state contains browser session credentials. It does not contain your password or MFA response.");
        return {
          authenticated: true,
          attempts,
          checkedAfterSeconds,
          authStateFile: config.authStateFile,
        };
      } catch (error) {
        if (!isPendingAuthentication(error)) throw error;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          throw new AuthenticationRequiredError(
            `SMU sign-in was not complete after ${timeoutSeconds} seconds. Run authentication again and finish SSO/MFA in Chrome.`,
          );
        }
        const waitMs = Math.min(pollIntervalSeconds * 1_000, remainingMs);
        log(`Sign-in is not complete yet; checking again in ${Math.round(waitMs / 1_000)} seconds.`);
        await delay(waitMs);
      }
    }
  } finally {
    await context.close();
  }
}

function isPendingAuthentication(error: unknown): boolean {
  return (
    error instanceof AuthenticationRequiredError ||
    (error instanceof ElearnError && (error.status === 401 || error.status === 403))
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
