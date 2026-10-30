export const PUSH_BATCH_SIZE = 25;

export function chunkForPushData<T>(records: readonly T[], batchSize: number = PUSH_BATCH_SIZE): T[][] {
  if (batchSize <= 0) throw new RangeError("batchSize must be a positive integer");
  if (records.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < records.length; i += batchSize) batches.push(records.slice(i, i + batchSize) as T[]);
  return batches;
}

export function takeFullPushBatches<T>(
  records: readonly T[],
  batchSize: number = PUSH_BATCH_SIZE,
): { batches: T[][]; remainder: T[] } {
  if (batchSize <= 0) throw new RangeError("batchSize must be a positive integer");
  const fullLength = Math.floor(records.length / batchSize) * batchSize;
  const batches: T[][] = [];
  for (let i = 0; i < fullLength; i += batchSize) batches.push(records.slice(i, i + batchSize) as T[]);
  return { batches, remainder: records.slice(fullLength) as T[] };
}
