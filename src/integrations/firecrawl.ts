import { isLocalUrl } from "../host/bind.ts";
import type { FetchLike } from "../template/fetch.ts";
import { pageRecordId, type PageRecord } from "../template/record.ts";

export type FirecrawlConfig = {
  apiUrl: string;
  apiKey?: string;
  timeoutMs: number;
};

export type FirecrawlExtractOptions = {
  fetch: FetchLike;
  env?: NodeJS.ProcessEnv;
  now?: string | Date;
  schema?: unknown;
};

type JsonObject = Record<string, unknown>;

const FIRECRAWL_CLOUD_URL = "https://api.firecrawl.dev";
const DEFAULT_PROBE_TIMEOUT_MS = 500;

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveFirecrawlConfig(env: NodeJS.ProcessEnv = process.env): FirecrawlConfig | null {
  const rawUrl = env.FIRECRAWL_URL?.trim() || env.FIRECRAWL_API_URL?.trim();
  const apiKey = env.FIRECRAWL_API_KEY?.trim();

  if (rawUrl) {
    if (!isLocalUrl(rawUrl)) return null;
    return { apiUrl: normalizeBaseUrl(rawUrl), apiKey: apiKey || undefined, timeoutMs: DEFAULT_PROBE_TIMEOUT_MS };
  }

  if (!apiKey) return null;
  return { apiUrl: FIRECRAWL_CLOUD_URL, apiKey, timeoutMs: DEFAULT_PROBE_TIMEOUT_MS };
}

function authHeaders(config: FirecrawlConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

export async function probeFirecrawl(config: FirecrawlConfig, fetch: FetchLike): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiUrl}/health`, {
      method: "GET",
      headers: authHeaders(config),
      signal: timeoutSignal(config.timeoutMs),
    });
    if (response.status === 401 || response.status === 403) return false;
    return response.status < 500;
  } catch {
    return false;
  }
}

function toIso(now?: string | Date): string {
  if (now == null) return new Date().toISOString();
  return typeof now === "string" ? now : now.toISOString();
}

function stringField(obj: JsonObject | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function objectField(obj: JsonObject, key: string): JsonObject | undefined {
  const value = obj[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function recordFromFirecrawl(url: string, payload: unknown, now?: string | Date): PageRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as JsonObject;
  const data = objectField(root, "data") ?? root;
  const json = objectField(data, "json");
  const title = stringField(json, "title", "name", "headline") ?? stringField(data, "title", "metadata.title") ?? "";
  const text =
    stringField(json, "text", "description", "summary", "content") ??
    stringField(data, "markdown", "text", "description") ??
    (json ? JSON.stringify(json) : "");
  if (!title.trim() && !text.trim()) return null;

  return {
    schemaVersion: 1,
    id: pageRecordId(url),
    url,
    title: title.trim() || text.slice(0, 200),
    text: text.trim() || title.trim(),
    kind: stringField(json, "kind", "@type", "type") ?? "WebPage",
    extractedBy: "firecrawl",
    terms: "public-page",
    retrievedAt: toIso(now),
  };
}

export async function firecrawlExtractFallback(url: string, options: FirecrawlExtractOptions): Promise<PageRecord | null> {
  const config = resolveFirecrawlConfig(options.env);
  if (!config) return null;
  if (!(await probeFirecrawl(config, options.fetch))) return null;

  const body: JsonObject = {
    url,
    formats: ["json", "markdown"],
    onlyMainContent: true,
  };
  if (options.schema && options.schema !== true) body.jsonOptions = { schema: options.schema };

  try {
    const response = await options.fetch(`${config.apiUrl}/v2/scrape`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(config),
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(config.timeoutMs),
    });
    if (!response.ok || response.status === 401 || response.status === 403) return null;
    return recordFromFirecrawl(url, JSON.parse(await response.text()), options.now);
  } catch {
    return null;
  }
}
