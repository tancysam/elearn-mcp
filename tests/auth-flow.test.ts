import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { runInteractiveAuthentication } from "../src/auth-flow.js";

const config: Config = {
  browser: "edge",
  baseUrl: "https://elearn.smu.edu.sg",
  lpVersion: "1.49",
  leVersion: "1.49",
  courseOrgUnitTypeId: 3,
  profileDir: "/tmp/elearn-auth-flow-profile-test",
  authStateFile: "/tmp/elearn-auth-flow-state-test.json",
  downloadDir: "/tmp/elearn-auth-flow-download-test",
  headless: true,
};

describe("interactive authentication timing", () => {
  it("rejects an initial wait longer than the total timeout before opening a browser", async () => {
    await expect(
      runInteractiveAuthentication(config, {
        initialWaitSeconds: 61,
        timeoutSeconds: 60,
      }),
    ).rejects.toMatchObject({ code: "INVALID_AUTH_TIMING" });
  });

  it("rejects non-positive polling intervals before opening a browser", async () => {
    await expect(
      runInteractiveAuthentication(config, {
        pollIntervalSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_AUTH_TIMING" });
  });
});
