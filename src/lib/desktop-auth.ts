import { headers } from "next/headers";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { getDesktopUser } from "@/lib/desktop-session";
import { desktopRouteDecision } from "@/lib/desktop-route-policy";
import { requestMessages } from "@/i18n/request";

const requestContext = new AsyncLocalStorage<Request>();

export function runWithDesktopRequest<T>(request: Request, callback: () => T) {
  return requestContext.run(request, callback);
}

/** Desktop tokens never fall through to cookie authentication. Unknown paths stay unauthorized. */
export async function desktopUserForAllowedRoute(path: string) {
  const request = requestContext.getStore();
  const requestHeaders = request ? request.headers : await headers();
  const token = requestHeaders.get("x-ora-desktop-token");
  if (!token) return { desktop: false as const, user: null };
  const url = request ? request.url : `http://localhost${path}`;
  const method = request?.method || "GET";
  if (!desktopRouteDecision(url, method)) {
    console.warn("desktop-policy-denied", JSON.stringify({ path, method, url, decision: false }));
    return { desktop: true as const, user: null };
  }
  return { desktop: true as const, user: await getDesktopUser(token) };
}

export async function desktopForbidden() {
  return NextResponse.json({ error: (await requestMessages()).api.desktopForbidden }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
