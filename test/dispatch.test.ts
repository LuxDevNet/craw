import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeSlash } from "../src/cli/interactive.ts";
import { dispatchScrape } from "../src/dispatch.ts";
import { getPlugin } from "../src/plugin.ts";

let tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

describe("plugin dispatch", () => {
  it("loads host, firecrawl, and brightdata scrape hooks", () => {
    expect(getPlugin("craw")?.scrape).toEqual(expect.any(Function));
    expect(getPlugin("firecrawl")?.scrape).toEqual(expect.any(Function));
    expect(getPlugin("brightdata")?.scrape).toEqual(expect.any(Function));
  });

  it("writes CARD.json for a host scrape", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "craw-dispatch-"));
    tmpDirs.push(cwd);
    const previous = process.cwd();
    const originalFetch = globalThis.fetch;
    process.chdir(cwd);
    try {
      globalThis.fetch = (async (url: string) => {
        if (String(url).endsWith("/robots.txt")) return { ok: false, status: 404, text: async () => "" };
        return {
          ok: true,
          status: 200,
          headers: { get: () => "text/html" },
          text: async () => "<html><head><title>Hello</title></head><body>hi</body></html>",
        };
      }) as unknown as typeof fetch;
      const result = await dispatchScrape(["https://example.com"]);
      expect(result.exitCode).toBe(0);
      const card = JSON.parse(await readFile(path.join(cwd, "storage/key_value_stores/default/CARD.json"), "utf8"));
      expect(card.taskId).toBe("craw:scrape");
      expect(card.status).toBe("ok");
    } finally {
      globalThis.fetch = originalFetch;
      process.chdir(previous);
    }
  });

  it("runs /scrape through executeSlash", async () => {
    const text = await executeSlash("/scrape https://example.com", {
      scrape: async (urls) => ({ pluginId: "craw", endpoint: "scrape", exitCode: 0, text: `craw scrape 1 ${urls[0]}` }),
    });
    expect(text).toContain("https://example.com");
  });
});
