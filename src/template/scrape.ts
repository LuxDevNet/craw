import { appendPageRecord } from "../output/stream.ts";
import { createBrightDataUnlockerFetch } from "../integrations/brightdata.ts";
import { firecrawlExtractFallback } from "../integrations/firecrawl.ts";
import { searchSearxngJson } from "../integrations/searxng.ts";
import type { RouteName } from "../routing/route.ts";
import {
  fetchHtmlPages,
  type DelayLike,
  type FetchLike,
  type FetchPageError,
  type FetchResponseLike,
} from "./fetch.ts";
import { extractPage } from "./extract.ts";
import { isChallengeHtml } from "./probe.ts";
import { redactStringFields } from "./redact.ts";
import { SCRAPE_LIMITS, type PageRecord } from "./record.ts";

export type ScrapeErrorClass = "network" | "empty" | "challenge" | "schema" | "quota" | "denied";

export type ScrapeError = {
  url: string;
  class: ScrapeErrorClass;
  message: string;
  nextAction: "save-fixture" | "stop" | "none";
  route: RouteName;
  status?: number;
};

export type ScrapeOptions = {
  fetch?: FetchLike;
  outDir?: string;
  now?: string | Date | (() => string | Date);
  delay?: DelayLike;
  env?: NodeJS.ProcessEnv;
  route?: RouteName;
  schema?: unknown;
  maxPages?: number;
  maxRecords?: number;
};

export type ScrapeResult = {
  records: PageRecord[];
  errors: ScrapeError[];
};

function defaultFetch(): FetchLike {
  return (url, init) => globalThis.fetch(url, init) as Promise<FetchResponseLike>;
}

function retrievedAt(now: ScrapeOptions["now"]): string | Date | undefined {
  return typeof now === "function" ? now() : now;
}

function mapFetchError(error: FetchPageError, route: RouteName): ScrapeError {
  return {
    url: error.url,
    class: error.class,
    message: error.message,
    nextAction: "none",
    route,
    status: error.status,
  };
}

function resolveLimit(value: number | undefined, ceiling: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return ceiling;
  return Math.min(value, ceiling);
}

function redactRecord(record: PageRecord): PageRecord {
  const redacted = redactStringFields({ title: record.title, text: record.text });
  return {
    ...record,
    title: redacted.title ?? record.title,
    text: redacted.text ?? record.text,
  };
}

export async function scrape(urls: readonly string[], opts?: ScrapeOptions): Promise<ScrapeResult> {
  const baseFetch = opts?.fetch ?? defaultFetch();
  const route = opts?.route ?? "direct";
  const records: PageRecord[] = [];
  const errors: ScrapeError[] = [];
  const maxPages = resolveLimit(opts?.maxPages, SCRAPE_LIMITS.maxPages);
  const maxRecords = resolveLimit(opts?.maxRecords, SCRAPE_LIMITS.maxRecords);
  let targetUrls = [...urls];

  if (route === "search") {
    targetUrls = [];
    for (const query of urls) {
      const found = await searchSearxngJson(query, { fetch: baseFetch, env: opts?.env, limit: maxPages });
      if (found.length === 0) {
        errors.push({
          url: query,
          class: "network",
          message: "No local SearXNG JSON results",
          nextAction: "none",
          route,
        });
      }
      targetUrls.push(...found);
    }
  }

  let fetch = baseFetch;
  let honorRobots = true;
  if (route === "brightdata") {
    const brightDataFetch = createBrightDataUnlockerFetch({ fetch: baseFetch, env: opts?.env });
    if (!brightDataFetch) {
      return {
        records,
        errors: targetUrls.map((url) => ({
          url,
          class: "denied",
          message: "missing BRIGHTDATA_API_TOKEN",
          nextAction: "none",
          route,
        })),
      };
    }
    fetch = brightDataFetch;
    honorRobots = false;
  }

  const limitedUrls = targetUrls.slice(0, maxPages);

  if (targetUrls.length > maxPages) {
    errors.push({
      url: targetUrls[maxPages] ?? targetUrls.at(-1) ?? "",
      class: "quota",
      message: `Stopped after ${maxPages} pages`,
      nextAction: "none",
      route,
    });
  }

  const fetched = await fetchHtmlPages(limitedUrls, {
    fetch,
    delay: opts?.delay,
    maxConcurrency: SCRAPE_LIMITS.maxConcurrency,
    maxRequestRetries: SCRAPE_LIMITS.maxRequestRetries,
    honorRobots,
  });

  errors.push(...fetched.errors.map((error) => mapFetchError(error, route)));

  for (const page of fetched.pages) {
    if (records.length >= maxRecords) {
      errors.push({
        url: page.url,
        class: "quota",
        message: `Stopped after ${maxRecords} records`,
        nextAction: "none",
        route,
      });
      break;
    }

    if (isChallengeHtml(page.html)) {
      errors.push({
        url: page.url,
        class: "challenge",
        message: "Challenge page detected",
        nextAction: "stop",
        route,
        status: page.status,
      });
      continue;
    }

    const now = retrievedAt(opts?.now);
    let extracted = extractPage({
      url: page.url,
      html: page.html,
      contentType: page.contentType,
      now,
      allowExcerpt: !opts?.schema,
    });

    if (!extracted && opts?.schema) {
      extracted = await firecrawlExtractFallback(page.url, {
        fetch: baseFetch,
        env: opts.env,
        now,
        schema: opts.schema,
      });
    }

    extracted ??= extractPage({
      url: page.url,
      html: page.html,
      contentType: page.contentType,
      now,
    });

    if (!extracted) {
      errors.push({
        url: page.url,
        class: "empty",
        message: "No extractable page content",
        nextAction: "save-fixture",
        route,
        status: page.status,
      });
      continue;
    }

    try {
      const { record } = await appendPageRecord(redactRecord(extracted), { outDir: opts?.outDir });
      records.push(record);
    } catch (error) {
      errors.push({
        url: page.url,
        class: "schema",
        message: error instanceof Error ? error.message : String(error),
        nextAction: "save-fixture",
        route,
        status: page.status,
      });
    }
  }

  return { records, errors };
}
