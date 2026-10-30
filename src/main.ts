import { Actor } from "apify";
import { parseActorInput } from "./actor/input.ts";
import { buildContext } from "./output/context.ts";
import { scrape } from "./template/scrape.ts";

function errorsByClass(errors: { class: string; url: string; message: string }[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const error of errors) {
    grouped[error.class] ??= [];
    grouped[error.class]!.push(`${error.url}: ${error.message}`);
  }
  return grouped;
}

await Actor.init();

let exitCode = 0;
let statusMessage: string | undefined;

try {
  const input = parseActorInput((await Actor.getInput()) ?? {});
  const result = await scrape(input.startUrls, {
    maxPages: input.maxPages,
    maxRecords: input.maxRecords,
  });
  if (result.records.length > 0) await Actor.pushData(result.records);
  await Actor.setValue(
    "CONTEXT",
    buildContext(result.records, {
      totalOutput: result.records.length,
      perSource: { template: result.records.length },
      errors: errorsByClass(result.errors),
      seenTruncated: false,
      finishedAt: new Date().toISOString(),
    }),
  );
  console.log(`craw scrape ${result.records.length} chargeUsd=${input.maxTotalChargeUsd}`);
  if (result.records.length === 0) {
    exitCode = 1;
    statusMessage = "no page records";
  }
} catch (error) {
  exitCode = 1;
  statusMessage = error instanceof Error ? error.message : String(error);
  console.error(statusMessage);
}

await Actor.exit({ exitCode, statusMessage, exit: false });
process.exitCode = exitCode;
