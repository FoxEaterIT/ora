import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEAM_COLOR } from "@/lib/server-config";
import { getCurrentUser, isManager } from "@/lib/auth";
import { fullName } from "@/lib/users";
import { requestMessages } from "@/i18n/request";
import { desktopForbidden, desktopUserForAllowedRoute, runWithDesktopRequest } from "@/lib/desktop-auth";

const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  memberIds: z.array(z.string()).optional(),
});

function serializeTeam<T extends { id: string; name: string; description: string; color: string; members: { user: { id: string; firstName: string; lastName: string; email: string; role: string } }[] }>(team: T, includeManagementFields: boolean) {
  const members = team.members.map((member) => includeManagementFields ? ({
    ...member,
    user: {
      id: member.user.id,
      name: fullName(member.user),
      email: member.user.email,
      role: member.user.role,
    },
  }) : ({
    user: { name: fullName(member.user), email: member.user.email },
  }));
  if (!includeManagementFields) return { id: team.id, name: team.name, description: team.description, members };
  return { ...team, members };
}

export async function GET(request: Request) {
  return runWithDesktopRequest(request, async () => {
  const desktop = await desktopUserForAllowedRoute(request.url);
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  if (!me) return NextResponse.json({ error: (await requestMessages()).api.unauthenticated }, { status: 401 });

  const teams = await prisma.team.findMany({
    where: desktop.desktop || !isManager(me.role) ? { members: { some: { userId: me.id } } } : {},
    include: {
      members: { where: { user: { deactivatedAt: null } }, include: { user: true } },
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ teams: teams.map((team) => serializeTeam(team, !desktop.desktop)) }, desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : undefined);
  });
}

export async function POST(request: Request) {
  return runWithDesktopRequest(request, async () => {
  const desktop = await desktopUserForAllowedRoute(request.url);
  if (desktop.desktop) return desktopForbidden();
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const parsed = createTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidTeam }, { status: 400 });

  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      color: parsed.data.color ?? DEFAULT_TEAM_COLOR,
      members: parsed.data.memberIds?.length
        ? { create: (await prisma.user.findMany({ where: { id: { in: parsed.data.memberIds }, deactivatedAt: null }, select: { id: true } })).map((user) => ({ userId: user.id })) }
        : undefined,
    },
    include: { members: { where: { user: { deactivatedAt: null } }, include: { user: true } } },
  });

  return NextResponse.json({ team: serializeTeam(team, true) }, { status: 201 });
  });
}
