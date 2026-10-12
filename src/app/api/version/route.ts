import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getVersionCheck } from "@/lib/version-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "USER") return NextResponse.json({ error: "Forbidden" }, { status: user ? 403 : 401 });
  return NextResponse.json(await getVersionCheck(), { headers: { "Cache-Control": "private, max-age=3600" } });
}
