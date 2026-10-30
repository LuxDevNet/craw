## What does Craw do?

**Craw** fetches public **http(s) pages** you list in `startUrls` and saves one **PageRecord** per page. It reads the document with the base HTTP template: JSON-LD, embedded data, RSS, or a short excerpt. It is a public-page API for sites that already publish HTML, not a login bot and not a job-board product.

The Actor accepts explicit page URLs only. Remote URL-list files (`requestsFromUrl`) are rejected. Each run is capped at 20 pages and 50 records. A `maxTotalChargeUsd` field defaults to 1 and cannot be set above 5. The template run does not call other Actors.

## Why use Craw?

Use Craw when you want a small, repeatable fetch of public pages with a stable record shape.

- **PageRecord output** with `url`, `title`, `text`, `kind`, `extractedBy`, `terms`, and `retrievedAt`.
- **Apify dataset and key-value store**, so you can schedule runs, download JSON or CSV, and read a `CONTEXT` summary.
- **Low memory.** The default allocation is 256 MB, and the Actor refuses allocations above 1024 MB.
- **Optional jobs plugin.** Board-specific collection stays on `@agnamo/craw-jobs` (unjobbed). You add that plugin when you want it. This listing does not start it.
- **Optional delegate.** If you install `apify-client` yourself and pass an Actor id, a token, and `maxTotalChargeUsd`, `callOptInActor` can call that Actor. The template entrypoint never imports that function.

## What data can Craw extract?

| Field | Type | Description |
| --- | --- | --- |
| `url` | string | Public page URL that was fetched |
| `title` | string | Document title |
| `text` | string | Extracted public text |
| `kind` | string | Extractor classification, often `WebPage` |
| `extractedBy` | string | `jsonld`, `embedded`, `rss`, `excerpt`, or `firecrawl` |
| `terms` | string | Always `public-page` for this template |
| `retrievedAt` | string | UTC extraction time |
| `id` | string | Id derived from the canonical URL |

You can download the dataset in various formats such as JSON, HTML, CSV, or Excel.

## How to scrape a public page

1. Open the Actor and confirm the input tab shows **Start URLs**, **Max pages**, **Max records**, and **Max total charge (USD)**.
2. Paste one or more public `http` or `https` URLs. The prefill is `https://example.com`.
3. Leave **Max total charge (USD)** at `1` unless you have a smaller cap in mind. Set the same `maxTotalChargeUsd` on the Apify run.
4. Start the run. The dataset fills with PageRecord rows. The key-value store record `CONTEXT` holds the summary and a short sample.
5. Open the output tab, or call the run through the API tab, to download the dataset.

Local check from this repository, without deploying:

```bash
apify run --purge --input-file ./input.example.json
```

## How much will it cost to scrape public pages?

This Actor is priced as platform usage: compute units and storage for the pages you fetch. It does not charge a per-result event. A one-page run at 256 MB is a small compute-unit spend on the Apify free plan.

`maxTotalChargeUsd` is still required in the input so a later opt-in delegate cannot run open-ended. The template code records that cap and does not call Store Actors. When you schedule a run, set the run option `maxTotalChargeUsd` as well (1 USD is the input default; 5 USD is the ceiling this build accepts).

## Input

See the input tab for full configuration options.

`startUrls` is an array of `{ "url": "https://example.com" }` objects or plain URL strings. `maxPages` is an integer from 1 to 20. `maxRecords` is an integer from 1 to 50. `maxTotalChargeUsd` is a number from 0 to 5.

There is no proxy field, no browser field, and no board list on this Actor.

## Output

```json
{
  "schemaVersion": 1,
  "id": "0123456789abcdef",
  "url": "https://example.com",
  "title": "Example Domain",
  "text": "This domain is for use in illustrative examples.",
  "kind": "WebPage",
  "extractedBy": "excerpt",
  "terms": "public-page",
  "retrievedAt": "2026-01-15T12:00:00.000Z"
}
```

`CONTEXT` in the default key-value store repeats a short sample plus counts and error classes.

## Opt-in job plugins

The first Store listing is this public-page template. The jobs vertical is a second package, `@agnamo/craw-jobs` / unjobbed, and it is a plugin manifest on the host rather than the default Actor.

When that plugin runs, its default source list is the cold group of public APIs and feeds: RemoteOK, Remotive, Himalayas, We Work Remotely, Hacker News "Who is hiring", Greenhouse, Lever, Ashby, SmartRecruiters, Jobvite, Workable, Breezy, and Recruitee.

These unjobbed source ids stay opt-in. They are source names inside the jobs plugin, not Actor ids, and this template never selects them:

`linkedin`, `indeed`, `glassdoor`, `upwork`, `ziprecruiter`, `simplyhired`, `monster`, `wellfound`, `builtin`, `dice`, `workday`.

No third-party Store Actor id is built in. A delegate call has to name the Actor, present `APIFY_TOKEN`, and include `maxTotalChargeUsd`.

## FAQ, disclaimers, and support

### How do I deploy this Actor?

Publish only after `apify info` shows an authenticated account and you intend to deploy. From this directory:

```bash
apify login
apify push
```

After the build exists, set the Actor permission level to `LIMITED_PERMISSIONS` in Apify Console. That level is an Actor property (`actorPermissionLevel`). It is not a field in `actor.json`. Keep runs at or below the `maxTotalChargeUsd` cap.

### What does a challenge page produce?

A challenge or empty document becomes an error row in `CONTEXT` and does not invent a PageRecord. The direct template does not switch to a residential proxy.

### Are personal data and logins in scope?

Our Actors are ethical and do not extract any private user data, such as email addresses, gender, or location. They only extract what the user has chosen to share publicly. We therefore believe that our Actors, when used for ethical purposes by Apify users, are safe. However, you should be aware that your results could contain personal data. Personal data is protected by the GDPR in the European Union and by other regulations around the world. You should not scrape personal data unless you have a legitimate reason to do so. If you're unsure whether your reason is legitimate, consult your lawyers.

This Actor does not create accounts and does not submit forms. Use the Issues tab for bugs and the API tab to run it programmatically. Public page text is useful for archives, citations, and content review of sites you are allowed to fetch.
