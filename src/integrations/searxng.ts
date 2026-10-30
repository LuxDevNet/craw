import { isLocalUrl } from "../host/bind.ts";
import type { FetchLike } from "../template/fetch.ts";

export type SearxngConfig = {
  url: string;
  timeoutMs: number;
};

export type SearxngSearchOptions = {
  fetch: FetchLike;
  env?: NodeJS.ProcessEnv;
  limit?: number;
};

type SearxngResult = { url?: unknown };
type SearxngPayload = { results?: SearxngResult[] };

const DEFAULT_SEARCH_TIMEOUT_MS = 500;

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

export function resolveSearxngConfig(env: NodeJS.ProcessEnv = process.env): SearxngConfig | null {
  const raw = env.SEARXNG_URL?.trim();
  if (!raw || !isLocalUrl(raw)) return null;
  return { url: raw.replace(/\/+$/, ""), timeoutMs: DEFAULT_SEARCH_TIMEOUT_MS };
}

export async function searchSearxngJson(query: string, options: SearxngSearchOptions): Promise<string[]> {
  const config = resolveSearxngConfig(options.env);
  if (!config) return [];

  try {
    const endpoint = new URL("/search", config.url);
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("format", "json");
    const response = await options.fetch(endpoint.href, { signal: timeoutSignal(config.timeoutMs) });
    if (!response.ok) return [];
    const payload = JSON.parse(await response.text()) as SearxngPayload;
    const limit = options.limit ?? 10;
    return (payload.results ?? [])
      .map((result) => (typeof result.url === "string" ? result.url : null))
      .filter((url): url is string => Boolean(url))
      .slice(0, limit);
  } catch {
    return [];
  }
}
