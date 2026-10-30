import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scrape } from "./template/scrape.ts";
import { PageRecordSchema } from "./template/record.ts";
import { brightdataPlugin } from "./plugins/brightdata.ts";
import { firecrawlPlugin } from "./plugins/firecrawl.ts";
import { hostPlugin } from "./plugins/host.ts";
import {
  BRIGHTDATA_LAYER_MANIFEST,
  FIRECRAWL_LAYER_MANIFEST,
  HOST_MANIFEST,
  UNJOBBED_PLUGIN_MANIFEST,
  type CrawPlugin,
  type PluginManifest,
} from "./plugin-types.ts";

export {
  BRIGHTDATA_LAYER_MANIFEST,
  FIRECRAWL_LAYER_MANIFEST,
  HOST_MANIFEST,
  PLUGIN_ENDPOINTS,
  UNJOBBED_PLUGIN_MANIFEST,
  type CrawPlugin,
  type PluginEndpoint,
  type PluginKind,
  type PluginManifest,
} from "./plugin-types.ts";

const plugins = new Map<string, CrawPlugin>();
let builtinsRegistered = false;

function materializeManifest(plugin: CrawPlugin): PluginManifest {
  const value = typeof plugin.manifest === "function" ? plugin.manifest() : plugin.manifest;
  return { ...value, endpoints: [...value.endpoints] };
}

export function manifest(): PluginManifest {
  return { ...HOST_MANIFEST, endpoints: [...HOST_MANIFEST.endpoints] };
}

export function registerPlugin(plugin: CrawPlugin): PluginManifest {
  const item = materializeManifest(plugin);
  if (!item.id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(item.id)) {
    throw new Error(`Invalid craw plugin id: ${item.id}`);
  }
  plugins.set(item.id, plugin);
  return item;
}

export function unregisterPlugin(id: string): boolean {
  return plugins.delete(id);
}

export function getPlugin(id: string): CrawPlugin | undefined {
  ensureBuiltins();
  return plugins.get(id);
}

export function listPluginManifests(): PluginManifest[] {
  ensureBuiltins();
  return [...plugins.values()].map(materializeManifest);
}

export const basePlugin: CrawPlugin = hostPlugin;

export function ensureBuiltins(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerPlugin(hostPlugin);
  registerPlugin(firecrawlPlugin);
  registerPlugin(brightdataPlugin);
}

function jobsPluginCandidates(cwd: string): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    process.env.CRAW_JOBS_PLUGIN,
    path.join(cwd, "src/craw-plugin.ts"),
    path.join(cwd, "src/craw-plugin.js"),
    path.resolve(cwd, "../unjobbed/src/craw-plugin.ts"),
    path.resolve(here, "../../../../Plugins/unjobbed/src/craw-plugin.ts"),
  ].filter((value): value is string => Boolean(value));
}

export async function discoverPlugins(options: { cwd?: string; packageJson?: string } = {}): Promise<PluginManifest[]> {
  ensureBuiltins();
  const cwd = options.cwd ?? process.cwd();
  const packageJsonPath = options.packageJson ?? path.join(cwd, "package.json");
  const specs = new Set<string>();

  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      craw?: { plugins?: string[] };
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const spec of pkg.craw?.plugins ?? []) specs.add(spec);
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (name.startsWith("@agnamo/craw-") || name === "unjobbed") specs.add(name);
    }
  }

  const pluginsDir = path.join(cwd, "plugins");
  if (existsSync(pluginsDir)) {
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
        specs.add(path.join(pluginsDir, entry.name));
      }
    }
  }

  for (const spec of specs) {
    try {
      await loadPlugin(spec, cwd);
    } catch {
      // Skip unloadable marketplace specs; discovery must not crash the host.
    }
  }

  if (!getPlugin("craw-jobs")) {
    for (const candidate of jobsPluginCandidates(cwd)) {
      if (!existsSync(candidate)) continue;
      try {
        await loadPlugin(candidate, cwd);
        break;
      } catch {
        continue;
      }
    }
  }

  return listPluginManifests();
}

export async function loadPlugin(spec: string, cwd = process.cwd()): Promise<PluginManifest> {
  const resolved = spec.startsWith(".") || path.isAbsolute(spec) ? path.resolve(cwd, spec) : spec;
  const href = path.isAbsolute(resolved) ? pathToFileURL(resolved).href : resolved;
  const mod = await import(href);
  const plugin = mod.default ?? mod.plugin ?? mod.crawPlugin;
  if (plugin) return registerPlugin(plugin as CrawPlugin);
  if (typeof mod.manifest === "function") {
    return registerPlugin({ manifest: mod.manifest, scrape });
  }
  throw new Error(`Craw plugin ${spec} did not export a plugin or manifest()`);
}

export const recordSchema = PageRecordSchema;
