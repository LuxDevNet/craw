import { SCRAPE_LIMITS } from "../template/record.ts";
import { readChargeEnv, resolveMaxTotalChargeUsd } from "./charge.ts";

export type ActorScrapeInput = {
  mode: "scrape";
  startUrls: string[];
  maxPages: number;
  maxRecords: number;
  maxTotalChargeUsd: number;
};

function parseBoundedInt(value: unknown, label: string, ceiling: number): number {
  if (value === undefined || value === null || value === "") return ceiling;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > ceiling) {
    throw new Error(`${label} must be an integer from 1 to ${ceiling}`);
  }
  return n;
}

function assertHttpUrl(value: string): string {
  const url = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported URL protocol: ${url}`);
  }
  return url;
}

export function normalizeStartUrls(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const urls: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      urls.push(assertHttpUrl(item));
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (typeof record.requestsFromUrl === "string") {
        throw new Error("requestsFromUrl is not supported; pass explicit http(s) startUrls");
      }
      if (typeof record.url === "string") {
        urls.push(assertHttpUrl(record.url));
        continue;
      }
    }
    throw new Error("startUrls entries must be http(s) URLs");
  }
  if (urls.length === 0) throw new Error("scrape requires at least one URL");
  return urls;
}

export function parseActorInput(raw: unknown, env: NodeJS.ProcessEnv = process.env): ActorScrapeInput {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Actor input must be an object");
  }
  const body = raw as Record<string, unknown>;
  return {
    mode: "scrape",
    startUrls: normalizeStartUrls(body.startUrls),
    maxPages: parseBoundedInt(body.maxPages, "maxPages", SCRAPE_LIMITS.maxPages),
    maxRecords: parseBoundedInt(body.maxRecords, "maxRecords", SCRAPE_LIMITS.maxRecords),
    maxTotalChargeUsd: resolveMaxTotalChargeUsd(body.maxTotalChargeUsd, readChargeEnv(env)),
  };
}
