import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/server-config";
import { getCurrentUser, isManager, publicUser } from "@/lib/auth";

const schema = z.object({
  role: z.enum(["ADMIN", "USER"]).optional(),
  email: z.string().trim().email().max(254).optional(),
  resetPassword: z.literal(true).optional(),
}).refine((data) => data.role !== undefined || data.email !== undefined || data.resetPassword === true);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (me.role !== "OWNER") {
    return NextResponse.json({ error: "Solo l'owner può cambiare i ruoli." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati utente non validi." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "L'account owner si gestisce dalla pagina account." }, { status: 403 });
  }

  const email = parsed.data.email?.trim().toLowerCase();
  if (email && email !== target.email.toLowerCase()) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Questa email è già utilizzata da un altro account." }, { status: 409 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(email ? { email } : {}),
        ...(parsed.data.resetPassword ? { passwordHash: null } : {}),
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const { id } = await params;
  if (id === me.id) return NextResponse.json({ error: "Non puoi eliminare il tuo account." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "L'owner non si può eliminare." }, { status: 403 });
  }
  if (target.role === "ADMIN" && me.role !== "OWNER") {
    return NextResponse.json({ error: "Solo l'owner può eliminare un admin." }, { status: 403 });
  }

  if (target.email === OWNER_EMAIL) {
    return NextResponse.json({ error: "L'account owner configurato non si può eliminare." }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
