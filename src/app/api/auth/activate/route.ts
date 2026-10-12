import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureOwner, PENDING_OWNER_EMAIL } from "@/lib/seed";
import { hashPassword, publicUser, setSession } from "@/lib/auth";

const activationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Le password non coincidono.",
});

/**
 * Set the initial password for an account created by the owner.
 * A conditional update prevents two requests from activating the same account concurrently.
 */
export async function POST(request: Request) {
  await ensureOwner();
  const parsed = activationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi." }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email === PENDING_OWNER_EMAIL) return NextResponse.json({ error: "Completa la configurazione iniziale da /setup." }, { status: 403 });
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await prisma.user.updateMany({ where: { email, passwordHash: null, role: { not: "OWNER" } }, data: { passwordHash } });

  if (result.count !== 1) {
    return NextResponse.json({ error: "Account non trovato oppure già attivato. Prova ad accedere." }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Account non trovato." }, { status: 404 });

  await setSession(user.id);
  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}
