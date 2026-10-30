import { promises as fs } from "node:fs";
import path from "node:path";
import { parsePageRecord, type PageRecord } from "../template/record.ts";

export const STREAM_FILENAME = "stream.jsonl";
export const DEFAULT_STREAM_RELATIVE = path.join("storage", "datasets", "default", STREAM_FILENAME);

export type StreamPathOptions = {
  path?: string;
  outDir?: string;
  cwd?: string;
};

export function resolveStreamPath(options: StreamPathOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  if (options.path !== undefined) return path.isAbsolute(options.path) ? options.path : path.resolve(cwd, options.path);
  if (options.outDir !== undefined) return path.join(options.outDir, "datasets", "default", STREAM_FILENAME);
  return path.resolve(cwd, DEFAULT_STREAM_RELATIVE);
}

export function formatPageRecordLine(record: PageRecord): string {
  return `${JSON.stringify(record)}\n`;
}

export async function appendPageRecord(value: unknown, options: StreamPathOptions = {}): Promise<{ record: PageRecord; path: string }> {
  const record = parsePageRecord(value);
  const filePath = resolveStreamPath(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, formatPageRecordLine(record), "utf-8");
  return { record, path: filePath };
}
