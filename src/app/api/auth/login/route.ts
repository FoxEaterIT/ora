import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicUser, setSession, verifyPassword } from "@/lib/auth";
import { ensureOwner, PENDING_OWNER_EMAIL } from "@/lib/seed";
import { requestMessages } from "@/i18n/request";

const schema = z.object({
  email: z.string().email(),
  password: z.string().max(100).optional(),
  confirmPassword: z.string().optional(),
});

/** Sign in active accounts; account activation is handled by the dedicated endpoint. */
export async function POST(request: Request) {
  await ensureOwner();
  const t = await requestMessages();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t.api.invalidEmail }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email === PENDING_OWNER_EMAIL) return NextResponse.json({ error: t.api.completeSetup }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) return NextResponse.json({ error: t.api.accountNotFound }, { status: 404 });
  if (!user.passwordHash) {
    return NextResponse.json({ firstLogin: true });
  }
  if (parsed.data.password === undefined) {
    return NextResponse.json({ passwordRequired: true });
  }

  const password = parsed.data.password;
  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: t.api.incorrectPassword }, { status: 401 });
  }

  await setSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
