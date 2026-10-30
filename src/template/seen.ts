export const SEEN_ID_CAP = 50_000;

export type MergeSeenIdsResult = {
  ids: string[];
  seenTruncated: boolean;
};

export function mergeSeenIds(existing: readonly string[], incoming: readonly string[]): MergeSeenIdsResult {
  const merged = [...new Set([...existing, ...incoming])];
  const seenTruncated = merged.length > SEEN_ID_CAP;
  return {
    ids: merged.slice(-SEEN_ID_CAP),
    seenTruncated,
  };
}
