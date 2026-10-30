import type { RouteName } from "./route.ts";

export type TokenGatedRouteName = RouteName | "delegate";

export type TokenGateResult =
  | { allowed: true; retry: true }
  | { allowed: false; status: "denied"; message: "missing APIFY_TOKEN"; retry: false };

const TOKEN_REQUIRED_ROUTES = new Set<TokenGatedRouteName>(["residential", "datacenter", "delegate"]);

export function checkTokenGate(route: TokenGatedRouteName, tokenPresent: boolean): TokenGateResult {
  if (TOKEN_REQUIRED_ROUTES.has(route) && !tokenPresent) {
    return { allowed: false, status: "denied", message: "missing APIFY_TOKEN", retry: false };
  }
  return { allowed: true, retry: true };
}
