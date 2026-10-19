import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicUser, verifyPassword } from "@/lib/auth";
import { issueDesktopSession } from "@/lib/desktop-session";
import { clearDesktopLoginFailures, desktopLoginDelay, recordDesktopLoginFailure } from "@/lib/desktop-login-throttle";
import { ensureOwner, PENDING_OWNER_EMAIL } from "@/lib/seed";
import { requestMessages } from "@/i18n/request";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(100) });
const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

function clientIp(request: Request) {
  // Trust only the first forwarded address from the local reverse proxy configured for this installation.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

async function logDesktopLoginFailure(email: string) {
  const account = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
  console.info(JSON.stringify({ event: "desktop_login_failed", at: new Date().toISOString(), account }));
}

export async function POST(request: Request) {
  await ensureOwner();
  const t = await requestMessages();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidEmail }, { status: 400, headers: noStore });
  const email = parsed.data.email.trim().toLowerCase();
  const ip = clientIp(request);
  const waitMs = await desktopLoginDelay(ip, email);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  if (email === PENDING_OWNER_EMAIL) {
    await recordDesktopLoginFailure(ip, email);
    await logDesktopLoginFailure(email);
    return NextResponse.json({ error: t.api.desktopCredentials }, { status: 401, headers: noStore });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await recordDesktopLoginFailure(ip, email);
    await logDesktopLoginFailure(email);
    return NextResponse.json({ error: t.api.desktopCredentials }, { status: 401, headers: noStore });
  }
  await clearDesktopLoginFailures(ip, email);
  try {
    const session = await issueDesktopSession(user.id);
    return NextResponse.json({ session, user: publicUser(user) }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "DESKTOP_LOGIN_NOT_ALLOWED") {
      return NextResponse.json({ error: t.api.desktopCredentials }, { status: 401, headers: noStore });
    }
    throw error;
  }
}
