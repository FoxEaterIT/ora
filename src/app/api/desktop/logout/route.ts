import { NextResponse } from "next/server";
import { revokeDesktopSession } from "@/app/api/desktop/handoff/route";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  const token = request.headers.get("x-ora-desktop-token");
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  await revokeDesktopSession(token);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
