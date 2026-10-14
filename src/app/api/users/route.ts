import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager, publicUser } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";

const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  teamId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const includeDeactivated = new URL(request.url).searchParams.get("includeDeactivated") === "1" && isManager(me.role);
  const users = await prisma.user.findMany({
    where: includeDeactivated ? {} : { deactivatedAt: null },
    include: { memberships: { include: { team: { select: { id: true, name: true } } } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return NextResponse.json({ users: users.map(publicUser) });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t.api.invalidPerson }, { status: 400 });
  }
  if (parsed.data.role === "ADMIN" && me.role !== "OWNER") {
    return NextResponse.json({ error: t.api.ownerCreatesAdmin }, { status: 403 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email === me.email.toLowerCase()) return NextResponse.json({ error: t.api.ownerEmailTaken }, { status: 409 });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: t.api.userExists }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email,
      role: parsed.data.role,
      passwordHash: null,
      memberships: parsed.data.teamId && await prisma.team.findUnique({ where: { id: parsed.data.teamId } }) ? { create: { teamId: parsed.data.teamId } } : undefined,
    },
  });

  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}
