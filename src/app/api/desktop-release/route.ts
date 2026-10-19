import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDesktopRelease } from "@/lib/desktop-release-check";
import { requestMessages } from "@/i18n/request";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const t = await requestMessages();
    return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  }
  return NextResponse.json(await getDesktopRelease(), { headers: { "Cache-Control": "private, max-age=3600" } });
}
