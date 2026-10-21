import type { APIRequestContext, APIResponse } from "playwright-core";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { D2LClient } from "../src/d2l-client.js";
import { AuthenticationRequiredError } from "../src/errors.js";

const config: Config = {
  browser: "edge",
  baseUrl: "https://elearn.smu.edu.sg",
  lpVersion: "1.49",
  leVersion: "1.49",
  courseOrgUnitTypeId: 3,
  profileDir: "/tmp/elearn-profile-test",
  authStateFile: "/tmp/elearn-storage-state-test.json",
  downloadDir: "/tmp/elearn-download-test",
  headless: true,
};

function jsonResponse(body: unknown): APIResponse {
  return {
    status: () => 200,
    headers: () => ({ "content-type": "application/json; charset=utf-8" }),
    url: () => "https://elearn.smu.edu.sg/d2l/api/lp/1.49/enrollments/myenrollments/",
    json: async () => body,
  } as unknown as APIResponse;
}

describe("D2LClient course enrollment mapping", () => {
  it("follows bookmarks and uses PinDate as the authoritative pin state", async () => {
    const responses = [
      jsonResponse({
        Items: [
          {
            OrgUnit: { Id: 20, Name: "Unpinned Course", Code: "U20" },
            Access: { IsActive: true, CanAccess: true },
            PinDate: null,
          },
        ],
        PagingInfo: { HasMoreItems: true, Bookmark: "20" },
      }),
      jsonResponse({
        Items: [
          {
            OrgUnit: { Id: 21, Name: "Pinned Course", Code: "P21" },
            Access: { IsActive: true, CanAccess: true },
            PinDate: "2026-08-24T01:00:00.000Z",
          },
        ],
        PagingInfo: { HasMoreItems: false },
      }),
    ];
    const get = vi.fn(async (_url: string) => responses.shift() as APIResponse);
    const client = new D2LClient({ get } as unknown as APIRequestContext, config);

    const courses = await client.listCourses({ pinnedOnly: true });

    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ id: 21, name: "Pinned Course", isPinned: true });
    expect(get).toHaveBeenCalledTimes(2);
    expect(String(get.mock.calls[1]?.[0])).toContain("bookmark=20");
  });

  it("keeps inactive courses available when activeOnly is false", async () => {
    const get = vi.fn(async (_url: string) =>
      jsonResponse({
        Items: [
          {
            OrgUnit: { Id: 30, Name: "Past Course", Code: "OLD30" },
            Access: { IsActive: false, CanAccess: false },
          },
        ],
        PagingInfo: { HasMoreItems: false },
      }),
    );
    const client = new D2LClient({ get } as unknown as APIRequestContext, config);

    await expect(client.listCourses({ activeOnly: false })).resolves.toMatchObject([
      { id: 30, isActive: false, canAccess: false },
    ]);
  });
});

describe("D2LClient authentication boundary", () => {
  it("reports a login redirect as an authentication error", async () => {
    const get = vi.fn(async (_url: string) =>
      ({
        status: () => 302,
        headers: () => ({ location: "/d2l/loginh/" }),
        url: () => "https://elearn.smu.edu.sg/d2l/api/lp/1.49/users/whoami",
      }) as unknown as APIResponse,
    );
    const client = new D2LClient({ get } as unknown as APIRequestContext, config);

    await expect(client.whoAmI()).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });
});
