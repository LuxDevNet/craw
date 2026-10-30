import { describe, expect, it } from "vitest";
import { assertDelegateAllowed, OPT_IN_JOB_SOURCE_IDS } from "../src/routing/delegate.ts";

describe("optional actor delegate", () => {
  it("requires an explicit actor id, token, and charge cap", () => {
    expect(
      assertDelegateAllowed({
        actorId: "agnamo/craw-jobs",
        token: "token-present",
        maxTotalChargeUsd: 1,
        input: { sources: ["remoteok"] },
      }),
    ).toMatchObject({ actorId: "agnamo/craw-jobs", maxTotalChargeUsd: 1 });
  });

  it("stops before any client call when the token or actor id is missing", () => {
    expect(() => assertDelegateAllowed({ actorId: "agnamo/craw-jobs", maxTotalChargeUsd: 1 })).toThrow(/APIFY_TOKEN/);
    expect(() => assertDelegateAllowed({ actorId: "  ", token: "token-present" })).toThrow(/actor id/);
  });

  it("keeps needs-route job source ids off the template actor", () => {
    expect(OPT_IN_JOB_SOURCE_IDS).toEqual([
      "linkedin",
      "indeed",
      "glassdoor",
      "upwork",
      "ziprecruiter",
      "simplyhired",
      "monster",
      "wellfound",
      "builtin",
      "dice",
      "workday",
    ]);
  });
});
