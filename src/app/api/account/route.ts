import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, publicUser, verifyPassword } from "@/lib/auth";
import { revokeDesktopSessionsForUser } from "@/lib/desktop-session";
import { requestMessages } from "@/i18n/request";

const schema = z.object({
  email: z.string().trim().email().max(254).optional(),
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100).optional().or(z.literal("")),
});

export async function PATCH(request: Request) {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidAccount }, { status: 400 });
  if (!me.passwordHash || !(await verifyPassword(parsed.data.currentPassword, me.passwordHash))) {
    return NextResponse.json({ error: t.api.incorrectCurrentPassword }, { status: 401 });
  }

  const requestedEmail = parsed.data.email?.trim().toLowerCase();
  if (me.role !== "OWNER" && requestedEmail && requestedEmail !== me.email.toLowerCase()) {
    return NextResponse.json({ error: t.api.ownerEmailOnly }, { status: 403 });
  }
  const email = me.role === "OWNER" ? requestedEmail || me.email : me.email;
  if (!parsed.data.newPassword && !requestedEmail) {
    return NextResponse.json({ error: t.api.accountChangeRequired }, { status: 400 });
  }
  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: me.id },
        data: {
          email,
          passwordHash: parsed.data.newPassword ? await hashPassword(parsed.data.newPassword) : undefined,
        },
      });
      if (parsed.data.newPassword) await revokeDesktopSessionsForUser(updated.id, "password-changed", tx);
      return updated;
    });
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: t.api.emailUsedByAnother }, { status: 409 });
    }
    throw error;
  }
}
