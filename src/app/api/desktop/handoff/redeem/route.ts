import { NextResponse } from "next/server";
import { consumeDesktopHandoff } from "@/app/api/desktop/handoff/route";
export async function POST(request: Request) {
  const token = request.headers.get("origin");
  // This endpoint is intended for the native desktop client, never browser pages.
  if (token) return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const result = code.length <= 128 ? await consumeDesktopHandoff(code) : null;
  if (!result) return NextResponse.json({ error: "Code invalid or expired" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ session: result.session }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
}
