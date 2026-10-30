import { createHash } from "node:crypto";
import { z } from "zod";

export const ExtractedBySchema = z.enum(["jsonld", "embedded", "rss", "excerpt", "firecrawl"]);
export type ExtractedBy = z.infer<typeof ExtractedBySchema>;

export const PageRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string(),
  text: z.string(),
  kind: z.string(),
  extractedBy: ExtractedBySchema,
  terms: z.literal("public-page"),
  retrievedAt: z.string().datetime(),
});

export type PageRecord = z.infer<typeof PageRecordSchema>;

export const SCRAPE_LIMITS = {
  maxPages: 20,
  maxRecords: 50,
  timeBudgetMs: 60_000,
  maxRequestRetries: 2,
  maxConcurrency: 2,
} as const;

export type ScrapeLimits = typeof SCRAPE_LIMITS;

export function canonicalUrlForPageId(input: string): string {
  const u = new URL(input);
  u.hash = "";
  u.search = "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.href;
}

export function pageRecordId(url: string): string {
  const canonical = canonicalUrlForPageId(url);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function parsePageRecord(value: unknown): PageRecord {
  return PageRecordSchema.parse(value);
}
