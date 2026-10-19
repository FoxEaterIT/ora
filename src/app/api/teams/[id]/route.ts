import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { fullName } from "@/lib/users";
import { requestMessages } from "@/i18n/request";
import { desktopForbidden, desktopUserForAllowedRoute } from "@/lib/desktop-auth";

const teamSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await desktopUserForAllowedRoute("/api/teams")).desktop) return desktopForbidden();
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const { id } = await params;
  const parsed = teamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidData }, { status: 400 });
  if (!(await prisma.team.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: t.api.teamNotFound }, { status: 404 });
  }

  const team = await prisma.$transaction(async (tx) => {
    if (parsed.data.memberIds) {
      const activeMembers = await tx.user.findMany({ where: { id: { in: parsed.data.memberIds }, deactivatedAt: null }, select: { id: true } });
      await tx.teamMember.deleteMany({ where: { teamId: id } });
      if (activeMembers.length) {
        await tx.teamMember.createMany({
          data: [...new Set(activeMembers.map((user) => user.id))].map((userId) => ({ teamId: id, userId })),
        });
      }
    }
    return tx.team.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        color: parsed.data.color,
      },
      include: { members: { where: { user: { deactivatedAt: null } }, include: { user: true } } },
    });
  });

  return NextResponse.json({
    team: {
      ...team,
      members: team.members.map((member) => ({
        ...member,
        user: { id: member.user.id, name: fullName(member.user), email: member.user.email, role: member.user.role },
      })),
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await desktopUserForAllowedRoute("/api/teams")).desktop) return desktopForbidden();
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.team.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: t.api.teamNotFound }, { status: 404 });
  await prisma.team.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
