import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scrape, type FetchLike } from "../src/index.ts";

let tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

describe("base scrape", () => {
  it("scrapes a URL with injected fetch and writes a JSONL record", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "craw-test-"));
    tmpDirs.push(outDir);
    const fetch: FetchLike = async (url) => {
      if (url.endsWith("/robots.txt")) {
        return { ok: false, status: 404, text: async () => "" };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => "<html><head><title>Hello Craw</title><meta name=\"description\" content=\"Base scrape works\"></head><body>hello</body></html>",
      };
    };

    const result = await scrape(["https://example.com/page"], {
      fetch,
      outDir,
      now: "2026-10-30T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ title: "Hello Craw", extractedBy: "excerpt" });

    const stream = await readFile(path.join(outDir, "datasets", "default", "stream.jsonl"), "utf8");
    expect(JSON.parse(stream.trim())).toMatchObject({ title: "Hello Craw" });
  });

  it("uses Firecrawl as a schema fallback after local structured extraction fails", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "craw-test-"));
    tmpDirs.push(outDir);
    const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/robots.txt")) return { ok: false, status: 404, text: async () => "" };
      if (url === "https://example.com/page") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "text/html" },
          text: async () => "<html><head><title>Local title</title></head><body>plain fallback only</body></html>",
        };
      }
      if (url === "https://api.firecrawl.dev/health") return { ok: true, status: 200, text: async () => "ok" };
      if (url === "https://api.firecrawl.dev/v2/scrape") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: { json: { title: "Firecrawl title", text: "Firecrawl text", kind: "Article" } } }),
        };
      }
      return { ok: false, status: 404, text: async () => "" };
    };

    const result = await scrape(["https://example.com/page"], {
      fetch,
      outDir,
      now: "2026-10-30T00:00:00.000Z",
      schema: { type: "object", properties: { title: { type: "string" } } },
      env: { FIRECRAWL_API_KEY: "test-key" },
    });

    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({ title: "Firecrawl title", text: "Firecrawl text", extractedBy: "firecrawl" });
    expect(calls.find((call) => call.url === "https://api.firecrawl.dev/v2/scrape")?.init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
  });

  it("skips Firecrawl when schema is set but no Firecrawl config exists", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "craw-test-"));
    tmpDirs.push(outDir);
    const fetch: FetchLike = async (url) => {
      if (url.endsWith("/robots.txt")) return { ok: false, status: 404, text: async () => "" };
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => "<html><head><title>Excerpt title</title></head><body>excerpt body</body></html>",
      };
    };

    const result = await scrape(["https://example.com/page"], {
      fetch,
      outDir,
      now: "2026-10-30T00:00:00.000Z",
      schema: true,
      env: {},
    });

    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({ title: "Excerpt title", extractedBy: "excerpt" });
  });

  it("uses Bright Data only for an explicit brightdata route", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "craw-test-"));
    tmpDirs.push(outDir);
    const requested: { url: string; body?: string }[] = [];
    const fetch: FetchLike = async (url, init) => {
      requested.push({ url, body: init?.body });
      if (url === "https://api.brightdata.com/request") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "text/html" },
          text: async () => "<html><head><title>Unlocked</title></head><body>ok</body></html>",
        };
      }
      return { ok: false, status: 404, text: async () => "" };
    };

    const result = await scrape(["https://blocked.example/page"], {
      fetch,
      outDir,
      route: "brightdata",
      env: { BRIGHTDATA_API_TOKEN: "bd-token" },
      now: "2026-10-30T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({ title: "Unlocked", extractedBy: "excerpt" });
    expect(JSON.parse(requested[0]!.body!)).toMatchObject({ url: "https://blocked.example/page", format: "raw" });
  });

  it("does not silently fail over to Bright Data on direct 403s", async () => {
    const requested: string[] = [];
    const fetch: FetchLike = async (url) => {
      requested.push(url);
      if (url.endsWith("/robots.txt")) return { ok: false, status: 404, text: async () => "" };
      return { ok: false, status: 403, text: async () => "forbidden" };
    };

    const result = await scrape(["https://indeed.com/jobs?q=test"], {
      fetch,
      env: { BRIGHTDATA_API_TOKEN: "bd-token" },
    });

    expect(result.records).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({ class: "denied", route: "direct", status: 403 }));
    expect(requested).not.toContain("https://api.brightdata.com/request");
  });

  it("expands local SearXNG JSON results for the search route", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "craw-test-"));
    tmpDirs.push(outDir);
    const fetch: FetchLike = async (url) => {
      if (url.startsWith("http://localhost:8080/search")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ results: [{ url: "https://example.com/result" }] }) };
      }
      if (url.endsWith("/robots.txt")) return { ok: false, status: 404, text: async () => "" };
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => "<html><head><title>Search result</title></head><body>ok</body></html>",
      };
    };

    const result = await scrape(["example query"], {
      fetch,
      outDir,
      route: "search",
      env: { SEARXNG_URL: "http://localhost:8080" },
      now: "2026-10-30T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({ url: "https://example.com/result", title: "Search result" });
  });
});
