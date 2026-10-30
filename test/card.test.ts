import { describe, expect, it } from "vitest";
import { buildCardResult, parseCardResult } from "../src/card.ts";

describe("CardResult", () => {
  it("builds the scrape envelope", () => {
    const card = buildCardResult({
      taskId: "craw:scrape",
      status: "ok",
      filesChanged: ["storage/key_value_stores/default/CONTEXT.json"],
      outputs: { jsonl: "storage/datasets/default/stream.jsonl" },
    });
    expect(card.taskId).toBe("craw:scrape");
    expect(card.verify.notes).toBe("local scrape");
    expect(parseCardResult(card).outputs.jsonl).toContain("stream.jsonl");
  });
});
