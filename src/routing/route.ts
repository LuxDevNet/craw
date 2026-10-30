export const ROUTE_NAMES = ["direct", "search", "datacenter", "residential", "brightdata", "custom"] as const;

export type RouteName = (typeof ROUTE_NAMES)[number];

export type ResolveRouteInput = {
  route?: RouteName;
  template?: boolean;
  challenged: boolean;
};

export function resolveRoute(input: ResolveRouteInput): RouteName {
  if (input.template) return "direct";
  return input.route ?? "direct";
}
