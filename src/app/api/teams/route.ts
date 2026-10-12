import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEAM_COLOR } from "@/lib/server-config";
import { getCurrentUser, isManager } from "@/lib/auth";
import { fullName } from "@/lib/users";

const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  memberIds: z.array(z.string()).optional(),
});

function serializeTeam<T extends { members: { user: { id: string; firstName: string; lastName: string; email: string; role: string } }[] }>(team: T) {
  return {
    ...team,
    members: team.members.map((member) => ({
      ...member,
      user: {
        id: member.user.id,
        name: fullName(member.user),
        email: member.user.email,
        role: member.user.role,
      },
    })),
  };
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const teams = await prisma.team.findMany({
    where: isManager(me.role) ? {} : { members: { some: { userId: me.id } } },
    include: {
      members: { include: { user: true } },
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ teams: teams.map(serializeTeam) });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const parsed = createTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati del team non validi." }, { status: 400 });

  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      color: parsed.data.color ?? DEFAULT_TEAM_COLOR,
      members: parsed.data.memberIds?.length
        ? { create: parsed.data.memberIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: { members: { include: { user: true } } },
  });

  return NextResponse.json({ team: serializeTeam(team) }, { status: 201 });
}
