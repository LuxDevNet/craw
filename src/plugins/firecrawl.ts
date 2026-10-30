import { runDoctor } from "../cli/doctor.ts";
import { FIRECRAWL_LAYER_MANIFEST, type CrawPlugin } from "../plugin-types.ts";
import { scrape } from "../template/scrape.ts";

export const firecrawlPlugin: CrawPlugin = {
  manifest: FIRECRAWL_LAYER_MANIFEST,
  scrape: (urls, opts) => scrape(urls, { ...opts, schema: opts?.schema ?? { type: "object" } }),
  doctor: async () => (await runDoctor()).filter((line) => line.check === "firecrawl"),
};
