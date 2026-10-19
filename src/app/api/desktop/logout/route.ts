import { NextResponse } from "next/server";
import { revokeDesktopSession } from "@/lib/desktop-session";
import { requestMessages } from "@/i18n/request";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function POST(request: Request) {
  const token = request.headers.get("x-ora-desktop-token");
  if (!token) return NextResponse.json({ error: (await requestMessages()).api.unauthenticated }, { status: 401, headers: noStore });
  await revokeDesktopSession(token, "logout");
  return NextResponse.json({ ok: true }, { headers: noStore });
}
