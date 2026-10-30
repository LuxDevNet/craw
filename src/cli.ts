#!/usr/bin/env node
import { dispatchDoctor, dispatchRun, dispatchScrape } from "./dispatch.ts";
import { runInteractive } from "./cli/interactive.ts";
import { discoverPlugins, getPlugin, listPluginManifests } from "./plugin.ts";

export function parseArgs(args: string[]) {
  const flags: Record<string, string | boolean | string[]> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        flags[k!] = v!;
      } else if (i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
        if (flags[key]) flags[key] = Array.isArray(flags[key]) ? [...flags[key], args[i + 1]!] : [String(flags[key]), args[i + 1]!];
        else flags[key] = args[i + 1]!;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
        flags[key] = args[i + 1]!;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printHelp() {
  console.log(`
Craw CLI — base host and plugin endpoint runtime

USAGE:
  craw                      Open the interactive plugin command TUI
  craw scrape <url...>       Scrape public pages with the selected plugin
  craw doctor                Check cold-start prerequisites without secrets
  craw plugins [--json]      List host and discovered plugin manifests
  craw <plugin> scrape <url> Dispatch scrape through a loaded plugin
  craw <plugin> doctor       Dispatch doctor through a loaded plugin
  craw help                  Show this help message

EXAMPLES:
  npx @agnamo/craw scrape https://example.com
  npx @agnamo/craw scrape --plugin firecrawl --schema schema.json https://example.com
  npx @agnamo/craw scrape --route brightdata https://example.com
  npx @agnamo/craw firecrawl scrape https://example.com
  npx @agnamo/craw plugins --json
`);
}

function pluginIdFromFlags(flags: Record<string, unknown>, fallback = "craw"): string {
  const value = flags.plugin ?? flags.p;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function handlePluginsCommand(flags: Record<string, unknown>) {
  const plugins = flags.discover === false ? listPluginManifests() : await discoverPlugins();
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ plugins }, null, 2)}\n`);
    return;
  }
  for (const item of plugins) {
    const plugin = getPlugin(item.id);
    const hooks = [
      plugin?.scrape ? "scrape" : null,
      plugin?.run ? "run" : null,
      plugin?.doctor ? "doctor" : null,
    ].filter(Boolean);
    console.log(`${item.id}\t${item.kind}\t${item.npmName}\t${item.vertical}\t${hooks.join(",") || item.endpoints.join(",")}`);
  }
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0]?.toLowerCase();
  if (!command) {
    await runInteractive({ manifests: await discoverPlugins() });
    return;
  }

  await discoverPlugins();
  const pluginCommand = getPlugin(command);
  if (pluginCommand && positional[1]) {
    const endpoint = positional[1]!.toLowerCase();
    if (endpoint === "scrape") {
      const result = await dispatchScrape(positional.slice(2), flags, command);
      console.log(result.text);
      process.exitCode = result.exitCode;
      return;
    }
    if (endpoint === "doctor") {
      const result = await dispatchDoctor(command);
      process.stdout.write(`${result.text}\n`);
      process.exitCode = result.exitCode;
      return;
    }
    if (endpoint === "run") {
      const result = await dispatchRun(command, { args: positional.slice(2), flags });
      console.log(result.text);
      process.exitCode = result.exitCode;
      return;
    }
  }

  switch (command) {
    case "scrape": {
      const result = await dispatchScrape(positional.slice(1), flags, pluginIdFromFlags(flags));
      console.log(result.text);
      process.exitCode = result.exitCode;
      break;
    }
    case "doctor": {
      const result = await dispatchDoctor(pluginIdFromFlags(flags));
      process.stdout.write(`${result.text}\n`);
      process.exitCode = result.exitCode;
      break;
    }
    case "plugins":
      await handlePluginsCommand(flags);
      break;
    case "help":
    default:
      printHelp();
      break;
  }
}

main().catch((error) => {
  console.error("Craw Error:", error);
  process.exit(1);
});
