import type { FetchLike, FetchResponseLike } from "../template/fetch.ts";

export type BrightDataConfig = {
  apiToken: string;
  zone: string;
};

export type BrightDataOptions = {
  fetch: FetchLike;
  env?: NodeJS.ProcessEnv;
};

const BRIGHTDATA_REQUEST_URL = "https://api.brightdata.com/request";
const DEFAULT_UNLOCKER_ZONE = "web_unlocker1";

export function resolveBrightDataConfig(env: NodeJS.ProcessEnv = process.env): BrightDataConfig | null {
  const apiToken = env.BRIGHTDATA_API_TOKEN?.trim() || env.BRIGHT_DATA_API_TOKEN?.trim();
  if (!apiToken) return null;
  return {
    apiToken,
    zone: env.BRIGHTDATA_ZONE?.trim() || env.BRIGHT_DATA_ZONE?.trim() || DEFAULT_UNLOCKER_ZONE,
  };
}

function textResponse(status: number, body: string): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "text/html" },
    text: async () => body,
  };
}

export function createBrightDataUnlockerFetch(options: BrightDataOptions): FetchLike | null {
  const config = resolveBrightDataConfig(options.env);
  if (!config) return null;

  return async (url) => {
    try {
      const response = await options.fetch(BRIGHTDATA_REQUEST_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          zone: config.zone,
          url,
          format: "raw",
        }),
      });

      if (response.status === 401 || response.status === 403) {
        return textResponse(response.status, "");
      }
      return response;
    } catch (error) {
      return textResponse(599, error instanceof Error ? error.message : String(error));
    }
  };
}
