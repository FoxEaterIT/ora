import { NextRequest, NextResponse } from "next/server";
import { desktopRouteDecision } from "@/lib/desktop-route-policy";

const denied = { error: "Desktop session is not permitted for this endpoint" };

function deny() {
  return NextResponse.json(denied, { status: 403, headers: { "Cache-Control": "no-store" } });
}

/** Coarse allowlist. Route handlers repeat authorization and ownership checks. */
export function middleware(request: NextRequest) {
  if (!request.headers.has("x-ora-desktop-token")) return NextResponse.next();
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  if (!desktopRouteDecision(request.nextUrl.toString(), request.method)) return deny();
  return NextResponse.next();
}
