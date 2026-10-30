import { promises as fs } from "node:fs";
import path from "node:path";
import { buildCardResult, type CardResult } from "./card.ts";
import { doctorExitCode, formatDoctorOutput, runDoctor, type DoctorLine } from "./cli/doctor.ts";
import { buildScrapeInput } from "./cli/scrape-input.ts";
import { buildContext } from "./output/context.ts";
import { resolveStreamPath } from "./output/stream.ts";
import { discoverPlugins, getPlugin, type CrawPlugin } from "./plugin.ts";
import { SCRAPE_LIMITS } from "./template/record.ts";
import type { ScrapeResult } from "./template/scrape.ts";

export type DispatchResult = {
  pluginId: string;
  endpoint: string;
  exitCode: number;
  text: string;
  card?: CardResult;
  scrape?: ScrapeResult;
};

function errorsByClass(errors: { class: string; url: string; message: string }[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const error of errors) {
    grouped[error.class] ??= [];
    grouped[error.class]!.push(`${error.url}: ${error.message}`);
  }
  return grouped;
}

export function validateScrapeUrls(urls: string[], route?: string): string | undefined {
  if (urls.length === 0) return "scrape requires at least one URL";
  if (route === "search") return undefined;
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return `unsupported URL protocol: ${url}`;
    } catch {
      return `invalid URL: ${url}`;
    }
  }
  return undefined;
}

export async function resolveDispatchPlugin(id = "craw"): Promise<CrawPlugin> {
  await discoverPlugins();
  const plugin = getPlugin(id) ?? getPlugin("craw");
  if (!plugin) throw new Error(`plugin not loaded: ${id}`);
  return plugin;
}

export async function dispatchDoctor(pluginId = "craw"): Promise<DispatchResult> {
  const plugin = await resolveDispatchPlugin(pluginId);
  const lines = plugin.doctor ? await plugin.doctor() : await runDoctor();
  const doctorLines = Array.isArray(lines) ? (lines as DoctorLine[]) : null;
  const formatted = doctorLines ? formatDoctorOutput(doctorLines) : `${JSON.stringify(lines, null, 2)}\n`;
  const exitCode = doctorLines ? doctorExitCode(doctorLines) : 0;
  return { pluginId, endpoint: "doctor", exitCode, text: formatted.trim() };
}

export async function dispatchScrape(
  urls: string[],
  flags: Record<string, unknown> = {},
  pluginId = "craw",
): Promise<DispatchResult> {
  const input = buildScrapeInput(urls, flags);
  if (flags.route != null && !input.route) {
    return { pluginId, endpoint: "scrape", exitCode: 2, text: `unsupported route: ${String(flags.route)}` };
  }
  const urlError = validateScrapeUrls(input.startUrls, input.route);
  if (urlError) return { pluginId, endpoint: "scrape", exitCode: 2, text: urlError };
  if (!Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > SCRAPE_LIMITS.maxPages) {
    return { pluginId, endpoint: "scrape", exitCode: 2, text: `maxPages must be an integer from 1 to ${SCRAPE_LIMITS.maxPages}` };
  }
  if (!Number.isInteger(input.maxRecords) || input.maxRecords < 1 || input.maxRecords > SCRAPE_LIMITS.maxRecords) {
    return { pluginId, endpoint: "scrape", exitCode: 2, text: `maxRecords must be an integer from 1 to ${SCRAPE_LIMITS.maxRecords}` };
  }

  const plugin = await resolveDispatchPlugin(pluginId);
  if (!plugin.scrape) {
    return { pluginId, endpoint: "scrape", exitCode: 2, text: `plugin ${pluginId} does not expose scrape` };
  }

  const kvDir = path.resolve(process.cwd(), "storage/key_value_stores/default");
  await fs.mkdir(kvDir, { recursive: true });
  const inputPath = path.join(kvDir, "INPUT.json");
  const contextPath = path.join(kvDir, "CONTEXT.json");
  const cardPath = path.join(kvDir, "CARD.json");
  await fs.writeFile(inputPath, JSON.stringify({ ...input, plugin: pluginId }, null, 2), "utf-8");

  const result = await plugin.scrape(input.startUrls, {
    route: pluginId === "brightdata" ? "brightdata" : input.route,
    schema: pluginId === "firecrawl" ? input.schema ?? { type: "object" } : input.schema,
    maxPages: input.maxPages,
    maxRecords: input.maxRecords,
  });
  const finishedAt = new Date().toISOString();
  const context = buildContext(result.records, {
    totalOutput: result.records.length,
    perSource: { [pluginId]: result.records.length },
    errors: errorsByClass(result.errors),
    seenTruncated: false,
    finishedAt,
  });
  await fs.writeFile(contextPath, JSON.stringify(context, null, 2), "utf-8");
  const jsonlPath = resolveStreamPath();
  const card = buildCardResult({
    taskId: `${pluginId}:scrape`,
    status: result.records.length === 0 ? "error" : result.errors.length > 0 ? "partial" : "ok",
    filesChanged: [inputPath, contextPath, jsonlPath, cardPath],
    outputs: { jsonl: jsonlPath, context: contextPath, card: cardPath },
  });
  await fs.writeFile(cardPath, JSON.stringify(card, null, 2), "utf-8");
  return {
    pluginId,
    endpoint: "scrape",
    exitCode: result.records.length > 0 ? 0 : 1,
    text: `craw scrape ${result.records.length} ${jsonlPath}`,
    card,
    scrape: result,
  };
}

export async function dispatchRun(pluginId: string, input: unknown): Promise<DispatchResult> {
  const plugin = await resolveDispatchPlugin(pluginId);
  if (!plugin.run) {
    return { pluginId, endpoint: "run", exitCode: 2, text: `plugin ${pluginId} does not expose run` };
  }
  const value = await plugin.run(input);
  return { pluginId, endpoint: "run", exitCode: 0, text: JSON.stringify(value, null, 2) };
}
