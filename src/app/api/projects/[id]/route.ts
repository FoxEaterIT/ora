import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";

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
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  const exists = await prisma.project.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });

  const project = await prisma.$transaction(async (tx) => {
    if (parsed.data.memberIds) {
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      if (parsed.data.memberIds.length) {
        await tx.projectMember.createMany({
          data: [...new Set(parsed.data.memberIds)].map((userId) => ({ projectId: id, userId })),
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const { id } = await params;
  await prisma.project.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
