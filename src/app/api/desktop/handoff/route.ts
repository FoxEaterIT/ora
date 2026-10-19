import { NextResponse } from "next/server";
import { requestMessages } from "@/i18n/request";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

/** Browser handoff is outside the approved desktop contract. Direct desktop login is the only issuance path. */
export async function POST() {
  return NextResponse.json({ error: (await requestMessages()).api.desktopForbidden }, { status: 403, headers: noStore });
}
