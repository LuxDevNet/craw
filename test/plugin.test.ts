import { afterEach, describe, expect, it } from "vitest";
import {
  BRIGHTDATA_LAYER_MANIFEST,
  FIRECRAWL_LAYER_MANIFEST,
  listPluginManifests,
  registerPlugin,
  unregisterPlugin,
  UNJOBBED_PLUGIN_MANIFEST,
  type CrawPlugin,
} from "../src/plugin.ts";

describe("plugin registry", () => {
  afterEach(() => {
    unregisterPlugin("social-test");
  });

  it("lists the host and loaded optional layer plugins", () => {
    const manifests = listPluginManifests();
    expect(manifests).toContainEqual(expect.objectContaining({ id: "craw", kind: "host", npmName: "@agnamo/craw" }));
    expect(manifests).toContainEqual(
      expect.objectContaining({ id: FIRECRAWL_LAYER_MANIFEST.id, layer: "optional", defaultScraper: false }),
    );
    expect(manifests).toContainEqual(
      expect.objectContaining({ id: BRIGHTDATA_LAYER_MANIFEST.id, layer: "optional", defaultScraper: false }),
    );
    expect(UNJOBBED_PLUGIN_MANIFEST.vertical).toBe("jobs");
  });

  it("registers plugin runtime hooks while exposing a manifest", () => {
    const plugin: CrawPlugin = {
      manifest: {
        id: "social-test",
        name: "social-test",
        title: "Social Test",
        description: "Test social plugin",
        version: "0.0.1",
        npmName: "@agnamo/craw-social-test",
        kind: "plugin",
        endpoints: ["scrape"],
        vertical: "social",
        license: "MIT",
      },
    };

    registerPlugin(plugin);

    expect(listPluginManifests()).toContainEqual(
      expect.objectContaining({ id: "social-test", npmName: "@agnamo/craw-social-test" }),
    );
  });
});
