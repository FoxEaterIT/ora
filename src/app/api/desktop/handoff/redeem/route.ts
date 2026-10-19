import { NextResponse } from "next/server";
import { requestMessages } from "@/i18n/request";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function POST() {
  return NextResponse.json({ error: (await requestMessages()).api.desktopForbidden }, { status: 403, headers: noStore });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

