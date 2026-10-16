import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicUser, verifyPassword } from "@/lib/auth";
import { ensureOwner, PENDING_OWNER_EMAIL } from "@/lib/seed";
import { requestMessages } from "@/i18n/request";
import { issueDesktopSession } from "@/app/api/desktop/handoff/route";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(100) });
const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function POST(request: Request) {
  await ensureOwner();
  const t = await requestMessages();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidEmail }, { status: 400, headers: noStore });
  const email = parsed.data.email.trim().toLowerCase();
  if (email === PENDING_OWNER_EMAIL) return NextResponse.json({ error: t.api.completeSetup }, { status: 403, headers: noStore });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: t.api.incorrectPassword }, { status: 401, headers: noStore });
  }
  const session = await issueDesktopSession(user.id);
  return NextResponse.json({ session, user: publicUser(user) }, { headers: noStore });
}
