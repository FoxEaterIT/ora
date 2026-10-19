const routes = [
  { path: /^\/api\/projects$/, methods: ["GET", "POST"] },
  { path: /^\/api\/projects\/[^/]+$/, methods: ["PATCH", "DELETE"] },
  { path: /^\/api\/entries$/, methods: ["GET", "POST"] },
  { path: /^\/api\/entries\/[^/]+$/, methods: ["PATCH", "DELETE"] },
  { path: /^\/api\/teams$/, methods: ["GET"] },
  { path: /^\/api\/desktop\/config$/, methods: ["GET"] },
  { path: /^\/api\/desktop\/logout$/, methods: ["POST"] },
] as const;

export function desktopRouteDecision(pathWithQuery: string, method: string) {
  const url = new URL(pathWithQuery, "http://localhost");
  const route = routes.find((candidate) => candidate.path.test(url.pathname));
  if (!route || !route.methods.some((allowedMethod) => allowedMethod === method)) return false;
  if (url.pathname === "/api/entries" && method === "GET" && (url.searchParams.get("mine") !== "1" || url.searchParams.size !== 1)) return false;
  if (url.pathname === "/api/projects" && method === "GET" && url.searchParams.size > 0) return false;
  if (url.pathname === "/api/projects" && method === "POST" && url.searchParams.size > 0) return false;
  if (/^\/api\/projects\/[^/]+$/.test(url.pathname) && url.searchParams.size > 0) return false;
  if (/^\/api\/entries\/[^/]+$/.test(url.pathname) && url.searchParams.size > 0) return false;
  if (["/api/teams", "/api/desktop/config", "/api/desktop/logout"].includes(url.pathname) && url.searchParams.size > 0) return false;
  return true;
}
