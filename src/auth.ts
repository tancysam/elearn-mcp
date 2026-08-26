#!/usr/bin/env node
import { runInteractiveAuthentication } from "./auth-flow.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
await runInteractiveAuthentication(config, {
  initialWaitSeconds: readSeconds("ELEARN_AUTH_INITIAL_WAIT_SECONDS", 60),
  pollIntervalSeconds: readSeconds("ELEARN_AUTH_POLL_INTERVAL_SECONDS", 15),
  timeoutSeconds: readSeconds("ELEARN_AUTH_TIMEOUT_SECONDS", 300),
  log: console.error,
});

function readSeconds(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number of seconds.`);
  }
  return parsed;
}
