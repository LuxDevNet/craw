export const DEFAULT_MAX_TOTAL_CHARGE_USD = 1;
export const MAX_TOTAL_CHARGE_USD_CAP = 5;

const CHARGE_ENV_KEYS = ["APIFY_MAX_TOTAL_CHARGE_USD", "ACTOR_MAX_TOTAL_CHARGE_USD"] as const;

export function readChargeEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of CHARGE_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseCharge(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_TOTAL_CHARGE_USD_CAP) {
    throw new Error(`${label} must be a number from 0 to ${MAX_TOTAL_CHARGE_USD_CAP}`);
  }
  return n;
}

export function resolveMaxTotalChargeUsd(inputValue: unknown, envValue?: string): number {
  const fromInput = parseCharge(inputValue, "maxTotalChargeUsd");
  const fromEnv = parseCharge(envValue, "maxTotalChargeUsd");
  if (fromInput === undefined && fromEnv === undefined) return DEFAULT_MAX_TOTAL_CHARGE_USD;
  if (fromInput === undefined) return fromEnv!;
  if (fromEnv === undefined) return fromInput;
  return Math.min(fromInput, fromEnv);
}
