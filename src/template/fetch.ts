import { SCRAPE_LIMITS } from "./record.ts";

export const TEMPLATE_USER_AGENT = "craw/0.1.0";

export type FetchHeaders = {
  get(name: string): string | null | undefined;
};

export type FetchResponseLike = {
  ok: boolean;
  status: number;
  headers?: FetchHeaders;
  text(): Promise<string>;
};

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export type DelayLike = (ms: number) => Promise<void>;
export type FetchErrorClass = "denied" | "network";

export type FetchPage = {
  url: string;
  status: number;
  html: string;
  contentType: string;
};

export type FetchPageError = {
  url: string;
  class: FetchErrorClass;
  message: string;
  status?: number;
};

export type FetchPagesResult = {
  pages: FetchPage[];
  errors: FetchPageError[];
};

export type FetchPagesOptions = {
  fetch: FetchLike;
  delay?: DelayLike;
  now?: () => number;
  userAgent?: string;
  maxConcurrency?: number;
  maxRequestRetries?: number;
  sameHostDelayMs?: number;
  honorRobots?: boolean;
};

type RobotRule = { type: "allow" | "disallow"; path: string };
type RobotGroup = { agents: string[]; rules: RobotRule[] };
type HostState = { chain: Promise<void>; lastPageRequestAt?: number; robots?: Promise<string | null> };

const DEFAULT_DELAY: DelayLike = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getHeader(headers: FetchHeaders | undefined, name: string): string {
  return headers?.get(name) ?? headers?.get(name.toLowerCase()) ?? "";
}

function robotProductToken(userAgent: string): string {
  return userAgent.toLowerCase().split(/[\/\s]/)[0] ?? userAgent.toLowerCase();
}

function matchesUserAgent(groupAgent: string, userAgent: string): boolean {
  const agent = groupAgent.toLowerCase();
  const product = robotProductToken(userAgent);
  return agent === "*" || agent === product || product.startsWith(agent);
}

function pushRobotGroup(groups: RobotGroup[], group: RobotGroup): RobotGroup {
  if (group.agents.length > 0 || group.rules.length > 0) {
    groups.push({ agents: [...group.agents], rules: [...group.rules] });
  }
  return { agents: [], rules: [] };
}

export function parseRobotsTxt(robotsTxt: string): RobotGroup[] {
  const groups: RobotGroup[] = [];
  let current: RobotGroup = { agents: [], rules: [] };

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      current = pushRobotGroup(groups, current);
      continue;
    }

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (current.rules.length > 0) current = pushRobotGroup(groups, current);
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current.agents.length > 0) {
      current.rules.push({ type: field, path: value });
    }
  }

  pushRobotGroup(groups, current);
  return groups;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function robotRuleMatches(rulePath: string, targetPath: string): boolean {
  if (!rulePath) return false;
  if (!rulePath.includes("*") && !rulePath.endsWith("$")) return targetPath.startsWith(rulePath);
  const anchored = rulePath.endsWith("$");
  const raw = anchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = `^${raw.split("*").map(escapeRegex).join(".*")}${anchored ? "$" : ""}`;
  return new RegExp(pattern).test(targetPath);
}

function matchingRules(groups: RobotGroup[], userAgent: string): RobotRule[] {
  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent !== "*" && matchesUserAgent(agent, userAgent)),
  );
  const selected =
    specific.length > 0
      ? specific
      : groups.filter((group) => group.agents.some((agent) => matchesUserAgent(agent, userAgent)));
  return selected.flatMap((group) => group.rules);
}

export function isRobotsAllowed(robotsTxt: string, url: string, userAgent = TEMPLATE_USER_AGENT): boolean {
  const rules = matchingRules(parseRobotsTxt(robotsTxt), userAgent);
  if (rules.length === 0) return true;
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  let matched: RobotRule | undefined;

  for (const rule of rules) {
    if (!robotRuleMatches(rule.path, path)) continue;
    if (!matched || rule.path.length > matched.path.length) {
      matched = rule;
    } else if (matched.path.length === rule.path.length && rule.type === "allow") {
      matched = rule;
    }
  }

  return matched?.type !== "disallow";
}

async function withHostLock<T>(hostState: HostState, task: () => Promise<T>): Promise<T> {
  const previous = hostState.chain;
  let release!: () => void;
  hostState.chain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

async function fetchText(fetch: FetchLike, url: string, userAgent: string) {
  const response = await fetch(url, { headers: { "user-agent": userAgent } });
  return { response, body: await response.text() };
}

async function fetchRobots(fetch: FetchLike, url: URL, userAgent: string): Promise<string | null> {
  try {
    const { response, body } = await fetchText(fetch, new URL("/robots.txt", url.origin).href, userAgent);
    return response.ok ? body : null;
  } catch {
    return null;
  }
}

async function fetchPageWithRetries(
  url: string,
  opts: Required<Pick<FetchPagesOptions, "fetch" | "delay" | "now" | "userAgent" | "maxRequestRetries">>,
): Promise<FetchPage | FetchPageError> {
  let lastError: unknown;
  const attempts = opts.maxRequestRetries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { response, body } = await fetchText(opts.fetch, url, opts.userAgent);
      if (response.ok) {
        return { url, status: response.status, html: body, contentType: getHeader(response.headers, "content-type") };
      }
      lastError = new Error(`HTTP ${response.status}`);
      if (attempt === attempts) {
        return {
          url,
          class: response.status === 401 || response.status === 403 ? "denied" : "network",
          message: `HTTP ${response.status}`,
          status: response.status,
        };
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        return { url, class: "network", message: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  return { url, class: "network", message: lastError instanceof Error ? lastError.message : String(lastError) };
}

async function runPool<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
}

export async function fetchHtmlPages(urls: readonly string[], options: FetchPagesOptions): Promise<FetchPagesResult> {
  const userAgent = options.userAgent ?? TEMPLATE_USER_AGENT;
  const delay = options.delay ?? DEFAULT_DELAY;
  const now = options.now ?? Date.now;
  const maxConcurrency = options.maxConcurrency ?? SCRAPE_LIMITS.maxConcurrency;
  const maxRequestRetries = options.maxRequestRetries ?? SCRAPE_LIMITS.maxRequestRetries;
  const sameHostDelayMs = options.sameHostDelayMs ?? 1_000;
  const honorRobots = options.honorRobots ?? true;
  const hostStates = new Map<string, HostState>();
  const pages: FetchPage[] = [];
  const errors: FetchPageError[] = [];

  function stateFor(url: URL): HostState {
    const existing = hostStates.get(url.host);
    if (existing) return existing;
    const created: HostState = { chain: Promise.resolve() };
    hostStates.set(url.host, created);
    return created;
  }

  await runPool(urls, maxConcurrency, async (rawUrl) => {
    const parsed = new URL(rawUrl);
    const hostState = stateFor(parsed);
    const result = await withHostLock(hostState, async () => {
      if (honorRobots) {
        hostState.robots ??= fetchRobots(options.fetch, parsed, userAgent);
        const robots = await hostState.robots;
        if (robots && !isRobotsAllowed(robots, parsed.href, userAgent)) {
          return { url: parsed.href, class: "denied", message: "Denied by robots.txt" } satisfies FetchPageError;
        }
      }

      if (hostState.lastPageRequestAt !== undefined) {
        const elapsed = now() - hostState.lastPageRequestAt;
        if (elapsed < sameHostDelayMs) await delay(sameHostDelayMs - elapsed);
      }
      hostState.lastPageRequestAt = now();

      return fetchPageWithRetries(parsed.href, { fetch: options.fetch, delay, now, userAgent, maxRequestRetries });
    });

    if ("html" in result) pages.push(result);
    else errors.push(result);
  });

  return { pages, errors };
}
