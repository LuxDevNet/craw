import { describe, expect, it } from "vitest";
import { parseActorInput } from "../src/actor/input.ts";

describe("actor input", () => {
  it("accepts request-list startUrls and applies the charge default", () => {
    const input = parseActorInput({ startUrls: [{ url: "https://example.com" }] }, {});
    expect(input).toMatchObject({
      mode: "scrape",
      startUrls: ["https://example.com"],
      maxPages: 20,
      maxRecords: 50,
      maxTotalChargeUsd: 1,
    });
  });

  it("uses the tighter charge cap when input and env disagree", () => {
    const input = parseActorInput(
      { startUrls: ["https://example.com/docs"], maxTotalChargeUsd: 4 },
      { APIFY_MAX_TOTAL_CHARGE_USD: "1.5" },
    );
    expect(input.maxTotalChargeUsd).toBe(1.5);
  });

  it("rejects remote URL lists and spend above the cap", () => {
    expect(() => parseActorInput({ startUrls: [{ requestsFromUrl: "https://example.com/list.txt" }] })).toThrow(/requestsFromUrl/);
    expect(() => parseActorInput({ startUrls: ["https://example.com"], maxTotalChargeUsd: 9 })).toThrow(/maxTotalChargeUsd/);
    expect(() => parseActorInput({ startUrls: ["javascript:alert(1)"] })).toThrow(/protocol/);
  });
});
