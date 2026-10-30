import { resolveMaxTotalChargeUsd } from "../actor/charge.ts";
import { checkTokenGate } from "./token-gate.ts";

export type DelegateCall = {
  actorId: string;
  input?: Record<string, unknown>;
  maxTotalChargeUsd?: number;
  token?: string;
};

export type AllowedDelegate = {
  actorId: string;
  input: Record<string, unknown>;
  maxTotalChargeUsd: number;
  token: string;
};

/** Needs-route source ids on the jobs plugin. These are not Actor ids and are not called by the template. */
export const OPT_IN_JOB_SOURCE_IDS = [
  "linkedin",
  "indeed",
  "glassdoor",
  "upwork",
  "ziprecruiter",
  "simplyhired",
  "monster",
  "wellfound",
  "builtin",
  "dice",
  "workday",
] as const;

type ActorCaller = {
  actor: (id: string) => {
    call: (input: Record<string, unknown>, options: { maxTotalChargeUsd: number }) => Promise<unknown>;
  };
};

type ApifyClientCtor = new (options: { token: string }) => ActorCaller;

export function assertDelegateAllowed(call: DelegateCall): AllowedDelegate {
  const actorId = call.actorId.trim();
  if (!actorId) throw new Error("delegate requires an explicit actor id");
  const gate = checkTokenGate("delegate", Boolean(call.token?.trim()));
  if (!gate.allowed) throw new Error(gate.message);
  return {
    actorId,
    input: call.input ?? {},
    maxTotalChargeUsd: resolveMaxTotalChargeUsd(call.maxTotalChargeUsd),
    token: call.token!.trim(),
  };
}

export async function callOptInActor(call: DelegateCall): Promise<unknown> {
  const allowed = assertDelegateAllowed(call);
  let ctor: ApifyClientCtor | undefined;
  try {
    const mod = (await import("apify-client")) as {
      ApifyClient?: ApifyClientCtor;
      default?: ApifyClientCtor | { ApifyClient?: ApifyClientCtor };
    };
    const exported = mod.ApifyClient ?? mod.default;
    ctor = typeof exported === "function" ? exported : exported?.ApifyClient;
  } catch {
    ctor = undefined;
  }
  if (!ctor) {
    throw new Error("Install the optional apify-client package before delegating to another Actor.");
  }
  const client = new ctor({ token: allowed.token });
  return client.actor(allowed.actorId).call(allowed.input, { maxTotalChargeUsd: allowed.maxTotalChargeUsd });
}
