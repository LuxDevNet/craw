import type { ScrapeOptions, ScrapeResult } from "./template/scrape.ts";

export const PLUGIN_ENDPOINTS = ["scrape", "run", "doctor", "plugins"] as const;
export type PluginEndpoint = (typeof PLUGIN_ENDPOINTS)[number] | string;
export type PluginKind = "host" | "plugin";

export type PluginManifest = {
  id: string;
  name: string;
  title: string;
  description: string;
  version: string;
  npmName: string;
  kind: PluginKind;
  endpoints: PluginEndpoint[];
  vertical: string;
  license: string;
  homepage?: string;
  layer?: "default" | "optional";
  defaultScraper?: boolean;
};

export type CrawPlugin = {
  manifest: PluginManifest | (() => PluginManifest);
  scrape?: (urls: readonly string[], opts?: ScrapeOptions) => Promise<ScrapeResult>;
  run?: (input: unknown) => Promise<unknown>;
  doctor?: () => Promise<unknown>;
};

export const HOST_MANIFEST: PluginManifest = {
  id: "craw",
  name: "craw",
  title: "Craw",
  description: "Base host and plugin endpoint runtime for public-page scraping.",
  version: "0.1.0",
  npmName: "@agnamo/craw",
  kind: "host",
  endpoints: ["scrape", "doctor", "plugins"],
  vertical: "base",
  license: "MIT",
  homepage: "https://github.com/LuxDevNet/craw",
};

export const UNJOBBED_PLUGIN_MANIFEST: PluginManifest = {
  id: "craw-jobs",
  name: "unjobbed",
  title: "Craw Jobs",
  description: "Jobs scraper plugin endpoint powered by Unjobbed for job boards and ATS sources.",
  version: "1.1.0",
  npmName: "@agnamo/craw-jobs",
  kind: "plugin",
  endpoints: ["scrape", "run", "doctor"],
  vertical: "jobs",
  license: "MIT",
  homepage: "https://github.com/LuxDevNet/unjobbed",
};

export const FIRECRAWL_LAYER_MANIFEST: PluginManifest = {
  id: "firecrawl",
  name: "firecrawl",
  title: "Firecrawl Layer",
  description: "Optional schema extraction fallback for Craw when Firecrawl credentials or a local Firecrawl URL are configured.",
  version: "0.1.0",
  npmName: "@agnamo/craw",
  kind: "plugin",
  endpoints: ["scrape", "doctor"],
  vertical: "base",
  license: "MIT",
  homepage: "https://firecrawl.dev",
  layer: "optional",
  defaultScraper: false,
};

export const BRIGHTDATA_LAYER_MANIFEST: PluginManifest = {
  id: "brightdata",
  name: "brightdata",
  title: "Bright Data Unlocker Layer",
  description: "Optional explicit-route Web Unlocker adapter for Craw; never used as silent failover.",
  version: "0.1.0",
  npmName: "@agnamo/craw",
  kind: "plugin",
  endpoints: ["scrape", "doctor"],
  vertical: "base",
  license: "MIT",
  homepage: "https://brightdata.com",
  layer: "optional",
  defaultScraper: false,
};
