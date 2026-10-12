import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager, publicUser } from "@/lib/auth";

const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  teamId: z.string().optional().nullable(),
});

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const users = await prisma.user.findMany({
    include: { memberships: { include: { team: { select: { id: true, name: true } } } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return NextResponse.json({ users: users.map(publicUser) });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Inserisci nome, cognome ed email validi." }, { status: 400 });
  }
  if (parsed.data.role === "ADMIN" && me.role !== "OWNER") {
    return NextResponse.json({ error: "Solo l'owner può creare un admin." }, { status: 403 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email === me.email.toLowerCase()) return NextResponse.json({ error: "L'email dell'owner è già associata al suo account." }, { status: 409 });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Esiste già un utente con questa email." }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email,
      role: parsed.data.role,
      passwordHash: null,
      memberships: parsed.data.teamId ? { create: { teamId: parsed.data.teamId } } : undefined,
    },
  });

  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}
