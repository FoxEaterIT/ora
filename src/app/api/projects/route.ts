import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PROJECT_COLOR } from "@/lib/server-config";
import { getCurrentUser, isManager } from "@/lib/auth";
import { fullName } from "@/lib/users";
import { canCreateProject } from "@/lib/project-policy";
import { requestMessages } from "@/i18n/request";
import { desktopUserForAllowedRoute, desktopForbidden } from "@/lib/desktop-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  teamId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function GET() {
  const desktop = await desktopUserForAllowedRoute("/api/projects");
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  if (!me) return NextResponse.json({ error: (await requestMessages()).api.unauthenticated }, { status: 401 });

  if (isManager(me.role)) {
    const projects = await prisma.project.findMany({
      include: {
        team: true,
        members: { where: { user: { deactivatedAt: null } }, include: { user: true } },
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

  const projects = await prisma.project.findMany({
    where: { archived: false },
    include: {
      team: true,
      members: { where: { user: { deactivatedAt: null } }, include: { user: true } },
      _count: { select: { entries: true } },
    },
    orderBy: { name: "asc" },
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

export async function POST(request: Request) {
  if ((await desktopUserForAllowedRoute("/api/projects")).desktop) return desktopForbidden();
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!canCreateProject(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidProject }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      color: parsed.data.color ?? DEFAULT_PROJECT_COLOR,
      teamId: isManager(me.role) ? parsed.data.teamId || null : null,
      members: {
        create: isManager(me.role)
          ? (parsed.data.memberIds?.length
              ? (await prisma.user.findMany({ where: { id: { in: parsed.data.memberIds }, deactivatedAt: null }, select: { id: true } })).map((user) => ({ userId: user.id }))
              : [{ userId: me.id }])
          : [{ userId: me.id }],
      },
    },
    include: { team: true, members: true },
  });

  return NextResponse.json({ project }, { status: 201 });
}
