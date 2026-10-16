import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDesktopUser } from "@/app/api/desktop/handoff/route";

const allowed = new Set(["/api/projects", "/api/entries"]);

export async function desktopUserForAllowedRoute(path: string) {
  const requestHeaders = await headers();
  const token = requestHeaders.get("x-ora-desktop-token");
  if (!token) return { desktop: false as const, user: null };
  if (!allowed.has(path)) return { desktop: true as const, user: null };
  return { desktop: true as const, user: await getDesktopUser(token) };
}

export function desktopForbidden() {
  return NextResponse.json({ error: "Desktop session is not permitted for this endpoint" }, { status: 403 });
}
