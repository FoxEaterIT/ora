import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callDeletion, sanitizeDeletionStatus } from "@/lib/deletion-ipc";
import { requestMessages } from "@/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const user = await getCurrentUser();
  const messages = await requestMessages();
  if (!user) return { response: NextResponse.json({ error: messages.api.unauthenticated }, { status: 401 }) };
  if (user.role !== "OWNER") return { response: NextResponse.json({ error: messages.api.forbidden }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const access = await authorize();
  if ("response" in access) return access.response;
  try {
    const status = sanitizeDeletionStatus(await callDeletion("status"));
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
  if (!origin || !host) return NextResponse.json({ error: "Origin validation is required." }, { status: 403 });
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
    catch { return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || body.confirm !== true || typeof body.keepData !== "boolean" || typeof body.createExcel !== "boolean") {
    return NextResponse.json({ error: "Explicit confirmation and valid uninstall choices are required." }, { status: 400 });
  }
  try {
    const result = await callDeletion("start", body.keepData, body.createExcel) as { accepted?: boolean; reason?: string };
    if (!result.accepted) return NextResponse.json({ error: result.reason === "busy" ? "An uninstall is already running." : "Uninstall request was rejected." }, { status: 409 });
    return NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Deletion service is unavailable. Contact the system administrator." }, { status: 503 });
  }
}
