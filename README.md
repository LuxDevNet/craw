# @agnamo/craw

Craw is the base host for Agnamo scraping packages. The host owns the generic public-page scraper and plugin endpoint contract; vertical tools such as jobs, social, and ecommerce register as plugins that use the Craw base.

## Use

```bash
npx @agnamo/craw
npx @agnamo/craw scrape https://example.com
npx @agnamo/craw scrape --schema schema.json https://example.com
npx @agnamo/craw scrape --route brightdata https://example.com
npx @agnamo/craw scrape --route search "site:example.com docs"
npx @agnamo/craw doctor
npx @agnamo/craw plugins --json
npx @agnamo/craw firecrawl scrape https://example.com
```

`craw` with no arguments opens the interactive TUI. Use `p` for the command palette, `/` for slash commands, click or arrows to move, Enter to run, `l` for plugin menus, and `q` to quit. `/scrape <url>` runs the host scraper in place.

`craw scrape` writes `storage/datasets/default/stream.jsonl`, `storage/key_value_stores/default/CONTEXT.json`, and `CARD.json` in the current working directory.

## Optional Layers

- Firecrawl is an optional schema extraction fallback. When `--schema` is set and either `FIRECRAWL_API_KEY` or a local `FIRECRAWL_URL` is configured, Craw probes Firecrawl with a 500ms timeout and then calls `POST /v2/scrape` only after local JSON-LD, embedded JSON, and RSS extraction fail. If Firecrawl is missing or down, Craw skips it.
- Bright Data Unlocker is an explicit route only: `--route brightdata`. Craw never upgrades direct 403s to Bright Data automatically, including LinkedIn and Indeed URLs. `BRIGHTDATA_API_TOKEN` is required; 401/403 responses are reported as denied, not thrown.
- SearXNG search is local JSON only: set `SEARXNG_URL` to a localhost URL and use `--route search`. Public sidecar URLs are rejected by the same local bind check used by host sidecars.

`craw doctor` reports Firecrawl, Bright Data, and SearXNG as `pass`, `warn`, or `missing` without printing secrets.

## Site

The static landing and marketplace surface lives in `site/`.

```bash
npm run site:serve
```

The site reads `site/plugins.json`, which mirrors the `{ "plugins": [...] }` payload from `craw plugins --json`. Refresh that file from the CLI output before uploading the directory to R2.

## Plugin Manifest

Marketplace sites can index Craw packages without installing them by reading each package's static `manifest()` export or mirrored package metadata:

```ts
import { type CrawPlugin } from "@agnamo/craw";

export function manifest() {
  return {
    id: "craw-jobs",
    name: "unjobbed",
    title: "Craw Jobs",
    description: "Jobs scraper plugin endpoint powered by Unjobbed.",
    version: "1.1.0",
    npmName: "@agnamo/craw-jobs",
    kind: "plugin",
    endpoints: ["scrape", "run", "doctor"],
    vertical: "jobs",
    license: "MIT",
    homepage: "https://github.com/LuxDevNet/unjobbed",
  };
}

export default {
  manifest,
  async scrape(urls, opts) {
    // call @agnamo/craw base or a vertical-specific scraper
  },
} satisfies CrawPlugin;
```

Required manifest fields are `id`, `name`, `title`, `description`, `version`, `npmName`, `kind`, `endpoints`, `vertical`, `license`, and optional `homepage`.

## Plugin Discovery

`craw plugins --json` prints:

```json
{
  "plugins": [
    {
      "id": "craw",
      "npmName": "@agnamo/craw",
      "kind": "host",
      "endpoints": ["scrape", "doctor", "plugins"]
    },
    {
      "id": "firecrawl",
      "kind": "plugin",
      "layer": "optional",
      "defaultScraper": false
    },
    {
      "id": "brightdata",
      "kind": "plugin",
      "layer": "optional",
      "defaultScraper": false
    }
  ]
}
```

Discovery checks:

- packages listed in `package.json` under `craw.plugins`
- dependencies named `@agnamo/craw-*`
- local entries under `./plugins/`

Host, Firecrawl, and Bright Data register as loadable plugins with `scrape`/`doctor` hooks. `craw-jobs` loads from `unjobbed` when that package is a dependency, listed in `craw.plugins`, present under `./plugins/`, or found at the sibling `Plugins/unjobbed` checkout.

## Sync

- GitHub repo: https://github.com/LuxDevNet/craw
- npm package: `@agnamo/craw`
- Cloudflare public site: https://agnamo-craw.agnamo.workers.dev

The Cloudflare site serves static files from `site/` through Worker `agnamo-craw` and R2 bucket `agnamo-craw`. `GET /plugins.json` exposes the Craw plugin manifest feed for marketplace discovery.

Deploy the site and Worker with one command:

```bash
npm run deploy:site
```

## Apify Actor

The generic Store Actor lives in `.actor/`. `src/main.ts` wraps the public-page template with `Actor.init()`, `Actor.getInput()`, `Actor.pushData()`, and `Actor.exit()`. Input is `startUrls` plus page, record, and `maxTotalChargeUsd` caps. Output is a PageRecord dataset and a `CONTEXT` key-value record.

Job collection is the `@agnamo/craw-jobs` plugin (unjobbed), published separately from this template. Its cold APIs and feeds are that plugin's default source list. These source ids stay opt-in on the jobs plugin and are not selected by the Craw Actor: `linkedin`, `indeed`, `glassdoor`, `upwork`, `ziprecruiter`, `simplyhired`, `monster`, `wellfound`, `builtin`, `dice`, `workday`.

`callOptInActor` in `src/routing/delegate.ts` is an optional `apify-client` path. It requires an explicit Actor id, `APIFY_TOKEN`, and `maxTotalChargeUsd`. The template entrypoint does not call it. `apify-client` is an optional peer dependency.

Local run:

```bash
apify run --purge --input-file ./input.example.json
```

Deploy only after `apify login` succeeds and you want the Actor on the platform: `apify push`, then set Console permission level `LIMITED_PERMISSIONS`.

## Publish

```bash
npm publish --access public
```
