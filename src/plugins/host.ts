import { runDoctor } from "../cli/doctor.ts";
import { HOST_MANIFEST, type CrawPlugin } from "../plugin-types.ts";
import { scrape } from "../template/scrape.ts";

export const hostPlugin: CrawPlugin = {
  manifest: HOST_MANIFEST,
  scrape,
  doctor: runDoctor,
};
