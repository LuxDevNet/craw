import { describe, expect, it } from "vitest";
import { runDoctor, type DoctorFs } from "../src/cli/doctor.ts";
import type { FetchLike } from "../src/index.ts";

const okFs: DoctorFs = {
  mkdir: async () => undefined,
  writeFile: async () => undefined,
  unlink: async () => undefined,
};

describe("doctor optional layers", () => {
  it("marks Firecrawl, Bright Data, and SearXNG as optional when missing", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 404, text: async () => "" });
    const lines = await runDoctor({
      fs: okFs,
      env: {},
      fetch,
      nodeVersion: "v20.12.0",
      isPlaywrightPresent: async () => false,
    });

    expect(lines).toContainEqual({ check: "firecrawl", status: "missing", detail: "optional" });
    expect(lines).toContainEqual({ check: "brightdata", status: "missing", detail: "optional" });
    expect(lines).toContainEqual({ check: "searxng", status: "missing", detail: "optional" });
  });

  it("checks configured optional layers without printing secrets", async () => {
    const fetch: FetchLike = async (url) => {
      if (url === "https://api.firecrawl.dev/health") return { ok: true, status: 200, text: async () => "ok" };
      if (url.startsWith("http://localhost:8080/search")) return { ok: true, status: 200, text: async () => "{\"results\":[]}" };
      return { ok: false, status: 404, text: async () => "" };
    };

    const lines = await runDoctor({
      fs: okFs,
      env: {
        FIRECRAWL_API_KEY: "fire-secret",
        BRIGHTDATA_API_TOKEN: "bright-secret",
        SEARXNG_URL: "http://localhost:8080",
      },
      fetch,
      nodeVersion: "v20.12.0",
      isPlaywrightPresent: async () => true,
    });

    expect(lines).toContainEqual({ check: "firecrawl", status: "pass", detail: "configured" });
    expect(lines).toContainEqual({ check: "brightdata", status: "pass", detail: "configured" });
    expect(lines).toContainEqual({ check: "searxng", status: "pass", detail: "local json" });
    expect(JSON.stringify(lines)).not.toContain("secret");
  });
});
