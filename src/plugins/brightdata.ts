import { runDoctor } from "../cli/doctor.ts";
import { BRIGHTDATA_LAYER_MANIFEST, type CrawPlugin } from "../plugin-types.ts";
import { scrape } from "../template/scrape.ts";

export const brightdataPlugin: CrawPlugin = {
  manifest: BRIGHTDATA_LAYER_MANIFEST,
  scrape: (urls, opts) => scrape(urls, { ...opts, route: "brightdata" }),
  doctor: async () => (await runDoctor()).filter((line) => line.check === "brightdata"),
};
