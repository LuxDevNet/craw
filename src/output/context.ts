import type { PageRecord } from "../template/record.ts";

export const OUTPUT_RECORD_CAP = 50;
export const CONTEXT_RECORD_CAP = 20;
export const CONTEXT_FIELD_MAX = 500;

export type ContextSummary = {
  totalOutput: number;
  perSource: Record<string, number>;
  errors: Record<string, string[]>;
  seenTruncated: boolean;
  finishedAt: string;
};

export type ContextFile = {
  summary: ContextSummary;
  records: PageRecord[];
};

export type BuildSummaryInput = {
  totalOutput: number;
  perSource: Record<string, number>;
  errors: Record<string, string[]>;
  seenTruncated: boolean;
  finishedAt: string;
};

export function buildSummary(input: BuildSummaryInput): ContextSummary {
  return {
    totalOutput: input.totalOutput,
    perSource: { ...input.perSource },
    errors: Object.fromEntries(Object.entries(input.errors).map(([key, messages]) => [key, [...messages]])),
    seenTruncated: input.seenTruncated,
    finishedAt: input.finishedAt,
  };
}

export function buildOutput(records: readonly PageRecord[]): PageRecord[] {
  return records.slice(0, OUTPUT_RECORD_CAP).map((record) => ({ ...record }));
}

function truncateRecordForContext(record: PageRecord): PageRecord {
  return { ...record, text: record.text.length > CONTEXT_FIELD_MAX ? record.text.slice(0, CONTEXT_FIELD_MAX) : record.text };
}

export function buildContext(records: readonly PageRecord[], summaryInput: BuildSummaryInput): ContextFile {
  return {
    summary: buildSummary(summaryInput),
    records: records.slice(0, CONTEXT_RECORD_CAP).map(truncateRecordForContext),
  };
}
