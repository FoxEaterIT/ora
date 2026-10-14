import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getVersionCheck } from "@/lib/version-check";
import { requestMessages } from "@/i18n/request";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "USER") {
    const t = await requestMessages();
    return NextResponse.json({ error: user ? t.api.forbidden : t.api.unauthenticated }, { status: user ? 403 : 401 });
  }
  return NextResponse.json(await getVersionCheck(), { headers: { "Cache-Control": "private, max-age=3600" } });
}
