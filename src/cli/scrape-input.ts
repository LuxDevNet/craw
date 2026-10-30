import { readFileSync } from "node:fs";
import { ROUTE_NAMES, type RouteName } from "../routing/route.ts";

export type ScrapeModeInput = {
  mode: "scrape";
  startUrls: string[];
  maxPages: number;
  maxRecords: number;
  route?: RouteName;
  schema?: unknown;
};

function numFlag(flags: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!flags) return undefined;
  for (const key of keys) {
    const value = flags[key];
    if (value === undefined || value === true) continue;
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function routeFlag(flags: Record<string, unknown> | undefined): RouteName | undefined {
  const value = flags?.route;
  if (typeof value !== "string") return undefined;
  return ROUTE_NAMES.includes(value as RouteName) ? (value as RouteName) : undefined;
}

function parseSchemaFlag(flags: Record<string, unknown> | undefined): unknown {
  const value = flags?.schema;
  if (value == null) return undefined;
  if (value === true) return true;
  const raw = String(value).trim();
  if (!raw) return true;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(readFileSync(raw, "utf8"));
    } catch {
      return true;
    }
  }
}

export function buildScrapeInput(urls: string[], flags?: Record<string, unknown>): ScrapeModeInput {
  return {
    mode: "scrape",
    startUrls: urls.map((u) => u.trim()).filter(Boolean),
    maxPages: numFlag(flags, "max-pages", "maxPages") ?? 20,
    maxRecords: numFlag(flags, "max-records", "maxRecords") ?? 50,
    route: routeFlag(flags),
    schema: parseSchemaFlag(flags),
  };
}
