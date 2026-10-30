import * as cheerio from "cheerio";
import { pageRecordId, type ExtractedBy, type PageRecord } from "./record.ts";

const SCHEMA_KINDS = new Set(["JobPosting", "Product", "Article", "Person", "Organization"]);

export type ExtractPageInput = {
  url: string;
  html: string;
  contentType?: string | null;
  now?: string | Date;
  allowExcerpt?: boolean;
};

type Item = Record<string, unknown>;

function toIso(now?: string | Date): string {
  if (now == null) return new Date().toISOString();
  return typeof now === "string" ? now : now.toISOString();
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<\/(p|div|section|article|h[1-6]|tr|blockquote)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
  return cleanText(text) || null;
}

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Item)[key];
  }
  return cur;
}

function str(obj: unknown, ...paths: string[]): string | null {
  for (const path of paths) {
    const v = get(obj, path);
    if (v == null || v === "") continue;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object") {
      const nested = str(v, "name", "text", "title", "label", "value", "formatted");
      if (nested) return nested;
    }
  }
  return null;
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw.trim());
  } catch {
    try {
      return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return undefined;
    }
  }
}

function flattenJsonLd(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value === "object") {
    const obj = value as Item;
    return Array.isArray(obj["@graph"]) ? [obj, ...flattenJsonLd(obj["@graph"])] : [obj];
  }
  return [];
}

export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld(?:\+|&#x2B;)json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1]?.trim();
    const parsed = raw ? tryJson(raw) : undefined;
    if (parsed) out.push(...flattenJsonLd(parsed));
  }
  return out;
}

export function embeddedJson(html: string): unknown[] {
  const out: unknown[] = [...jsonLdBlocks(html)];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1]?.trim();
    const parsed = raw ? tryJson(raw) : undefined;
    if (parsed) out.push(parsed);
  }
  return out;
}

function localSchemaType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.includes(":") ? raw.split(":").pop()! : raw;
  return SCHEMA_KINDS.has(name) ? name : null;
}

function schemaKind(obj: Item): string | null {
  const type = obj["@type"];
  if (typeof type === "string") return localSchemaType(type);
  if (Array.isArray(type)) {
    for (const entry of type) {
      const kind = localSchemaType(String(entry));
      if (kind) return kind;
    }
  }
  return null;
}

function recordFromSchemaObject(obj: Item, url: string, extractedBy: ExtractedBy, retrievedAt: string): PageRecord | null {
  const kind = schemaKind(obj);
  if (!kind) return null;
  const title = str(obj, "headline", "name", "title", "jobTitle", "legalName", "alternateName") ?? "";
  const text = stripHtml(str(obj, "description", "articleBody", "text", "about", "jobDescription", "descriptionPlain", "descriptionHtml", "snippet", "summary")) ?? title;
  if (!title.trim() && !text.trim()) return null;
  return {
    schemaVersion: 1,
    id: pageRecordId(url),
    url,
    title: title.trim() || text.slice(0, 200),
    text: text.trim() || title.trim(),
    kind,
    extractedBy,
    terms: "public-page",
    retrievedAt,
  };
}

function walkForSchemaObject(root: unknown): Item | null {
  const seen = new Set<unknown>();
  let found: Item | null = null;
  const walk = (value: unknown, depth: number) => {
    if (found || depth > 25 || value == null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const obj = value as Item;
    if (schemaKind(obj)) {
      found = obj;
      return;
    }
    for (const key of Object.keys(obj)) walk(obj[key], depth + 1);
  };
  walk(root, 0);
  return found;
}

function tryStructured(html: string, url: string, retrievedAt: string): PageRecord | null {
  for (const block of embeddedJson(html)) {
    if (typeof block !== "object" || block == null) continue;
    const direct = recordFromSchemaObject(block as Item, url, "jsonld", retrievedAt);
    if (direct) return direct;
    const nested = walkForSchemaObject(block);
    if (nested) {
      const fromNested = recordFromSchemaObject(nested, url, "embedded", retrievedAt);
      if (fromNested) return fromNested;
    }
  }
  return null;
}

function looksLikeRss(html: string, url: string, contentType?: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/rss") || ct.includes("application/atom") || ct.includes("application/xml") || ct.includes("text/xml")) return true;
  try {
    const u = new URL(url);
    if (/\.(rss|xml|atom)$/i.test(u.pathname) || /\/feed\/?$/i.test(u.pathname)) return true;
  } catch {}
  const trimmed = html.trimStart();
  return trimmed.startsWith("<rss") || trimmed.startsWith("<feed");
}

function tryRss(html: string, url: string, contentType: string | null | undefined, retrievedAt: string): PageRecord | null {
  if (!looksLikeRss(html, url, contentType)) return null;
  const $ = cheerio.load(html, { xml: true });
  const channelTitle = $("channel > title").first().text().trim();
  const itemTitle = $("item > title").first().text().trim() || $("entry > title").first().text().trim();
  const itemDesc = $("item > description").first().text().trim() || $("entry > summary").first().text().trim() || $("entry > content").first().text().trim();
  const title = itemTitle || channelTitle;
  const text = cleanText(itemDesc || channelTitle || title);
  if (!title && !text) return null;
  return { schemaVersion: 1, id: pageRecordId(url), url, title: title || text.slice(0, 200), text: text || title, kind: "WebPage", extractedBy: "rss", terms: "public-page", retrievedAt };
}

export function buildExcerpt(html: string, url: string, retrievedAt: string): PageRecord | null {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $('meta[property="og:title"]').attr("content")?.trim() || "";
  const desc = $('meta[name="description"]').attr("content")?.trim() || $('meta[property="og:description"]').attr("content")?.trim() || "";
  let text = [title, desc].filter(Boolean).join(" ").trim();
  if (!text) text = cleanText($("body").text()).slice(0, 500);
  else if (text.length > 500) text = text.slice(0, 500);
  if (!title && !text) return null;
  return { schemaVersion: 1, id: pageRecordId(url), url, title: title || text.slice(0, 200) || "Untitled", text: text || title, kind: "WebPage", extractedBy: "excerpt", terms: "public-page", retrievedAt };
}

export function extractPage(input: ExtractPageInput): PageRecord | null {
  const html = input.html ?? "";
  if (!html.trim()) return null;
  const retrievedAt = toIso(input.now);
  const local = tryStructured(html, input.url, retrievedAt) ?? tryRss(html, input.url, input.contentType, retrievedAt);
  if (local || input.allowExcerpt === false) return local;
  return buildExcerpt(html, input.url, retrievedAt);
}
