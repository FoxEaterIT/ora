import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { callUpdater, sanitizeUpdaterStatus } from "@/lib/updater-ipc";
import { requestMessages } from "@/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const user = await getCurrentUser();
  const messages = await requestMessages();
  if (!user) return { response: NextResponse.json({ error: messages.api.unauthenticated }, { status: 401 }) };
  if (!isManager(user.role)) return { response: NextResponse.json({ error: messages.api.forbidden }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const access = await authorize();
  if ("response" in access) return access.response;
  try {
    const status = sanitizeUpdaterStatus(await callUpdater("status"));
    return NextResponse.json({ available: true, status }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ available: false, status: null }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}

export async function POST(request: Request) {
  const access = await authorize();
  if ("response" in access) return access.response;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const result = await callUpdater("start") as { accepted?: boolean; reason?: string };
    if (!result.accepted) return NextResponse.json({ error: result.reason === "busy" ? "An update is already running." : "Update request was rejected." }, { status: 409 });
    return NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Updater service is unavailable. Contact the system administrator." }, { status: 503 });
  }
}
