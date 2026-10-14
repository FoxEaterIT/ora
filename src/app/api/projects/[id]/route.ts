import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  teamId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidData }, { status: 400 });

  const exists = await prisma.project.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: t.api.projectNotFound }, { status: 404 });

  const project = await prisma.$transaction(async (tx) => {
    if (parsed.data.memberIds) {
      const activeMembers = await tx.user.findMany({ where: { id: { in: parsed.data.memberIds }, deactivatedAt: null }, select: { id: true } });
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      if (activeMembers.length) {
        await tx.projectMember.createMany({
          data: [...new Set(activeMembers.map((user) => user.id))].map((userId) => ({ projectId: id, userId })),
        });
      }
    }
    return tx.project.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        color: parsed.data.color,
        archived: parsed.data.archived,
        teamId: parsed.data.teamId,
      },
      include: { team: true, members: true },
    });
  });

  return NextResponse.json({ project });
}

export async function DELETE() {
  const t = await requestMessages();
  return NextResponse.json({ error: t.api.deletionNotAllowed }, { status: 405 });
}
