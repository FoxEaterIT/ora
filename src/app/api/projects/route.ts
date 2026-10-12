import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PROJECT_COLOR } from "@/lib/server-config";
import { getCurrentUser, isManager } from "@/lib/auth";
import { trackableProjects } from "@/lib/access";
import { fullName } from "@/lib/users";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  teamId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  if (isManager(me.role)) {
    const projects = await prisma.project.findMany({
      include: {
        team: true,
        members: { include: { user: true } },
        _count: { select: { entries: true } },
      },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({
      projects: projects.map((project) => ({
        ...project,
        members: project.members.map((member) => ({
          ...member,
          user: { id: member.user.id, name: fullName(member.user), email: member.user.email },
        })),
      })),
    });
  }

  const projects = await trackableProjects(me);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: "Permesso negato." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati del progetto non validi." }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      color: parsed.data.color ?? DEFAULT_PROJECT_COLOR,
      teamId: parsed.data.teamId || null,
      members: parsed.data.memberIds?.length
        ? { create: parsed.data.memberIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: { team: true, members: true },
  });

  return NextResponse.json({ project }, { status: 201 });
}
