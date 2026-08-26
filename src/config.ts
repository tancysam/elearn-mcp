import os from "node:os";
import path from "node:path";

export interface Config {
  baseUrl: string;
  lpVersion: string;
  leVersion: string;
  courseOrgUnitTypeId: number;
  profileDir: string;
  authStateFile: string;
  downloadDir: string;
  headless: boolean;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  throw new Error(`Expected a boolean, received: ${value}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = (env.ELEARN_BASE_URL ?? "https://elearn.smu.edu.sg").replace(/\/$/, "");
  const profileDir = path.resolve(
    env.ELEARN_PROFILE_DIR ?? path.join(os.homedir(), ".elearn-mcp", "browser-profile"),
  );
  const authStateFile = path.resolve(
    env.ELEARN_AUTH_STATE_FILE ?? path.join(os.homedir(), ".elearn-mcp", "storage-state.json"),
  );
  const downloadDir = path.resolve(
    env.ELEARN_DOWNLOAD_DIR ?? path.join(process.cwd(), "downloads"),
  );

  return {
    baseUrl,
    lpVersion: env.ELEARN_LP_VERSION ?? "1.49",
    leVersion: env.ELEARN_LE_VERSION ?? "1.49",
    courseOrgUnitTypeId: parsePositiveInteger(env.ELEARN_COURSE_ORG_UNIT_TYPE_ID, 3),
    profileDir,
    authStateFile,
    downloadDir,
    headless: parseBoolean(env.ELEARN_HEADLESS, true),
  };
}
