import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolveBrightDataConfig } from "../integrations/brightdata.ts";
import { probeFirecrawl, resolveFirecrawlConfig } from "../integrations/firecrawl.ts";
import { resolveSearxngConfig } from "../integrations/searxng.ts";
import { isLocalUrl } from "../host/bind.ts";
import type { FetchLike, FetchResponseLike } from "../template/fetch.ts";

export type DoctorStatus = "pass" | "warn" | "fail" | "missing";
export type DoctorCheck = "node" | "storage" | "playwright" | "bind" | "token" | "firecrawl" | "brightdata" | "searxng";
export type DoctorLine = { check: DoctorCheck; status: DoctorStatus; detail: string };
export type DoctorFs = { mkdir: typeof mkdir; writeFile: typeof writeFile; unlink: typeof unlink };
export type RunDoctorOptions = {
  fs?: DoctorFs;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  isPlaywrightPresent?: () => Promise<boolean>;
  fetch?: FetchLike;
};

const DEFAULT_NODE_MIN = "20.12";
const SIDECAR_ENV_KEYS = ["SEARXNG_URL", "FIRECRAWL_URL"] as const;

function parseVersionTuple(version: string): [number, number, number] {
  const parts = version.trim().replace(/^v/i, "").split(".").map((p) => Number.parseInt(p, 10));
  return [Number.isFinite(parts[0]) ? parts[0]! : 0, Number.isFinite(parts[1]) ? parts[1]! : 0, Number.isFinite(parts[2]) ? parts[2]! : 0];
}

function compareVersionTuples(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  return 0;
}

function readMinNodeFromEngines(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { engines?: { node?: string } };
    const match = pkg.engines?.node?.match(/>=?\s*(\d+\.\d+(?:\.\d+)?)/);
    if (match?.[1]) return match[1];
  } catch {}
  return DEFAULT_NODE_MIN;
}

function checkNode(nodeVersion: string): DoctorLine {
  const min = readMinNodeFromEngines();
  return compareVersionTuples(parseVersionTuple(nodeVersion), parseVersionTuple(min)) >= 0
    ? { check: "node", status: "pass", detail: `>=${min}` }
    : { check: "node", status: "fail", detail: nodeVersion.startsWith("v") ? nodeVersion : `v${nodeVersion}` };
}

async function checkStorage(fs: DoctorFs, cwd: string): Promise<DoctorLine> {
  const storageDir = path.join(cwd, "storage");
  const probe = path.join(storageDir, ".doctor-write-probe");
  try {
    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return { check: "storage", status: "pass", detail: "writable" };
  } catch {
    return { check: "storage", status: "fail", detail: "not writable" };
  }
}

async function defaultPlaywrightPresent(): Promise<boolean> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  try {
    await dynamicImport("playwright");
    return true;
  } catch {
    return false;
  }
}

function defaultFetch(): FetchLike {
  return (url, init) => globalThis.fetch(url, init) as Promise<FetchResponseLike>;
}

function checkBind(env: NodeJS.ProcessEnv): DoctorLine {
  for (const key of SIDECAR_ENV_KEYS) {
    const raw = env[key]?.trim();
    if (raw && !isLocalUrl(raw)) return { check: "bind", status: "fail", detail: "public sidecar url" };
  }
  return { check: "bind", status: "pass", detail: "no public sidecar url" };
}

async function checkFirecrawl(env: NodeJS.ProcessEnv, fetch: FetchLike): Promise<DoctorLine> {
  if (!env.FIRECRAWL_API_KEY?.trim() && !env.FIRECRAWL_URL?.trim() && !env.FIRECRAWL_API_URL?.trim()) {
    return { check: "firecrawl", status: "missing", detail: "optional" };
  }
  const config = resolveFirecrawlConfig(env);
  if (!config) return { check: "firecrawl", status: "warn", detail: "non-local url ignored" };
  return (await probeFirecrawl(config, fetch))
    ? { check: "firecrawl", status: "pass", detail: "configured" }
    : { check: "firecrawl", status: "warn", detail: "configured but unreachable" };
}

function checkBrightData(env: NodeJS.ProcessEnv): DoctorLine {
  return resolveBrightDataConfig(env)
    ? { check: "brightdata", status: "pass", detail: "configured" }
    : { check: "brightdata", status: "missing", detail: "optional" };
}

async function checkSearxng(env: NodeJS.ProcessEnv, fetch: FetchLike): Promise<DoctorLine> {
  const config = resolveSearxngConfig(env);
  if (!env.SEARXNG_URL?.trim()) return { check: "searxng", status: "missing", detail: "optional" };
  if (!config) return { check: "searxng", status: "warn", detail: "non-local url ignored" };
  try {
    const endpoint = new URL("/search", config.url);
    endpoint.searchParams.set("q", "craw");
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint.href, { signal: AbortSignal.timeout(config.timeoutMs) });
    return response.status < 500
      ? { check: "searxng", status: "pass", detail: "local json" }
      : { check: "searxng", status: "warn", detail: "local json unreachable" };
  } catch {
    return { check: "searxng", status: "warn", detail: "local json unreachable" };
  }
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorLine[]> {
  const fs = options.fs ?? { mkdir, writeFile, unlink };
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const isPlaywrightPresent = options.isPlaywrightPresent ?? defaultPlaywrightPresent;
  const fetch = options.fetch ?? defaultFetch();
  return [
    checkNode(options.nodeVersion ?? process.version),
    await checkStorage(fs, cwd),
    (await isPlaywrightPresent())
      ? { check: "playwright", status: "pass", detail: "optional" }
      : { check: "playwright", status: "warn", detail: "not required" },
    checkBind(env),
    { check: "token", status: "pass", detail: env.APIFY_TOKEN?.trim() ? "set" : "missing" },
    await checkFirecrawl(env, fetch),
    checkBrightData(env),
    await checkSearxng(env, fetch),
  ];
}

export function formatDoctorLine(line: DoctorLine): string {
  return `${line.check} ${line.status} ${line.detail}`;
}

export function formatDoctorOutput(lines: DoctorLine[]): string {
  return lines.length === 0 ? "" : `${lines.map(formatDoctorLine).join("\n")}\n`;
}

export function doctorExitCode(lines: DoctorLine[]): number {
  return lines.some((line) => line.status === "fail") ? 1 : 0;
}
