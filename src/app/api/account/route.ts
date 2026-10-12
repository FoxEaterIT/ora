import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, publicUser, verifyPassword } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().email().max(254).optional(),
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100).optional().or(z.literal("")),
});

export async function PATCH(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Inserisci un indirizzo valido e una nuova password di almeno 8 caratteri." }, { status: 400 });
  if (!me.passwordHash || !(await verifyPassword(parsed.data.currentPassword, me.passwordHash))) {
    return NextResponse.json({ error: "La password attuale non è corretta." }, { status: 401 });
  }

  const requestedEmail = parsed.data.email?.trim().toLowerCase();
  if (me.role !== "OWNER" && requestedEmail && requestedEmail !== me.email.toLowerCase()) {
    return NextResponse.json({ error: "Solo l'owner può modificare l'indirizzo email." }, { status: 403 });
  }
  const email = me.role === "OWNER" ? requestedEmail || me.email : me.email;
  if (!parsed.data.newPassword && !requestedEmail) {
    return NextResponse.json({ error: "Inserisci una nuova password o un indirizzo email da modificare." }, { status: 400 });
  }
  try {
    const user = await prisma.user.update({
      where: { id: me.id },
      data: {
        email,
        passwordHash: parsed.data.newPassword ? await hashPassword(parsed.data.newPassword) : undefined,
      },
    });
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Questa email è già utilizzata da un altro account." }, { status: 409 });
    }
    throw error;
  }
}
