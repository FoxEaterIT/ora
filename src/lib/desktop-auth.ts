import { headers } from "next/headers";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { getDesktopUser } from "@/lib/desktop-session";
import { desktopRouteDecision } from "@/lib/desktop-route-policy";
import { requestMessages } from "@/i18n/request";

const requestContext = new AsyncLocalStorage<Request>();

export async function runWithDesktopRequest(request: Request, callback: () => Response | Promise<Response>): Promise<Response> {
  const response = await requestContext.run(request, callback);
  const url = new URL(request.url);
  if (!request.headers.has("x-ora-desktop-token") && !desktopRouteDecision(url.toString(), request.method)) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(desktopNoStoreHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Desktop tokens never fall through to cookie authentication. Unknown paths stay unauthorized. */
export async function desktopUserForAllowedRoute(path: string) {
  const request = requestContext.getStore();
  const requestHeaders = request ? request.headers : await headers();
  const token = requestHeaders.get("x-ora-desktop-token");
  if (!token) return { desktop: false as const, user: null };
  const url = request ? request.url : `http://localhost${path}`;
  const method = request?.method || "GET";
  if (!desktopRouteDecision(url, method)) return { desktop: true as const, user: null };
  return { desktop: true as const, user: await getDesktopUser(token) };
}

export function desktopNoStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store", Pragma: "no-cache" };
}

export async function desktopForbidden() {
  return NextResponse.json({ error: (await requestMessages()).api.desktopForbidden }, { status: 403, headers: desktopNoStoreHeaders() });
}

export function desktopJson<T>(body: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(desktopNoStoreHeaders())) headers.set(key, value);
  return NextResponse.json(body, { ...init, headers });
}
