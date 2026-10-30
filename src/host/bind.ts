const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isLocalUrl(value: string | URL): boolean {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
