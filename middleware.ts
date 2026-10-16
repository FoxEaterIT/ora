import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.headers.has("x-ora-desktop-token")) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const allowed = path === "/api/projects" || path === "/api/entries" || /^\/api\/entries\/[^/]+$/.test(path) || path === "/api/desktop/logout";
  if (!allowed) return NextResponse.json({ error: "Desktop session is not permitted for this endpoint" }, { status: 403 });
  if (path === "/api/projects" && request.method !== "GET") return NextResponse.json({ error: "Desktop session is read-only for projects" }, { status: 403 });
  if (path === "/api/entries" && !["GET", "POST"].includes(request.method)) return NextResponse.json({ error: "Method not permitted" }, { status: 403 });
  if (path.startsWith("/api/entries/") && !["PATCH", "DELETE"].includes(request.method)) return NextResponse.json({ error: "Method not permitted" }, { status: 403 });
  return NextResponse.next();
}
