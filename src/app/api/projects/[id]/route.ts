import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";
import { canAssignProjectMembers, canDeleteProject } from "@/lib/project-policy";
import { desktopForbidden, desktopUserForAllowedRoute, runWithDesktopRequest } from "@/lib/desktop-auth";

const userPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  memberIds: z.array(z.string()).optional(),
});

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  teamId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithDesktopRequest(request, async () => {
  const desktop = await desktopUserForAllowedRoute(request.url);
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const manager = isManager(me.role);
  if (!manager && body && typeof body === "object" && ("teamId" in body || "archived" in body)) {
    return NextResponse.json({ error: t.api.forbidden }, { status: 403, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  }
  const parsed = (manager ? schema : userPatchSchema).safeParse(body);
  const managerData = manager ? schema.safeParse(body) : null;
  if (!parsed.success) return NextResponse.json({ error: manager ? t.api.invalidData : t.api.forbidden }, { status: manager ? 400 : 403, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  if (desktop.desktop && Object.keys(parsed.data).some((key) => !["name", "description", "color", "memberIds", "teamId", "archived"].includes(key))) return desktopForbidden();

  const project = await prisma.$transaction(async (tx) => {
    if (parsed.data.memberIds) {
      if (!canAssignProjectMembers(me.role)) throw new Error("FORBIDDEN_ASSIGNMENT");
      const activeMembers = await tx.user.findMany({ where: { id: { in: parsed.data.memberIds }, deactivatedAt: null }, select: { id: true } });
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      if (activeMembers.length) await tx.projectMember.createMany({ data: [...new Set(activeMembers.map((user) => user.id))].map((userId) => ({ projectId: id, userId })) });
    }
    const managerPatch = managerData?.success ? managerData.data : undefined;
    const data = managerPatch
      ? { name: managerPatch.name, description: managerPatch.description, color: managerPatch.color, archived: managerPatch.archived, teamId: managerPatch.teamId }
      : { name: parsed.data.name, description: parsed.data.description, color: parsed.data.color };
    return tx.project.update({ where: { id }, data, include: { team: true, members: true } });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "FORBIDDEN_ASSIGNMENT") return "forbidden" as const;
    if (error instanceof Error && "code" in error && error.code === "P2025") return null;
    throw error;
  });
  if (project === "forbidden") return NextResponse.json({ error: t.api.forbidden }, { status: 403, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  if (!project) return NextResponse.json({ error: t.api.projectNotFound }, { status: 404, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  if (desktop.desktop) {
    const safe = await prisma.project.findUnique({
      where: { id },
      include: { team: true, members: { where: { user: { deactivatedAt: null } }, include: { user: true } }, _count: { select: { entries: true } } },
    });
    if (!safe) return NextResponse.json({ error: t.api.projectNotFound }, { status: 404, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
    return NextResponse.json({ project: {
      id: safe.id, name: safe.name, description: safe.description, color: safe.color, archived: safe.archived,
      team: safe.team ? { id: safe.team.id, name: safe.team.name } : null,
      members: safe.members.map(({ user }) => ({ user: { id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), email: user.email } })),
      hasEntries: safe._count.entries > 0,
    } }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  }
  return NextResponse.json({ project });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithDesktopRequest(_request, async () => {
  const desktop = await desktopUserForAllowedRoute(_request.url);
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  if (desktop.desktop) return desktopForbidden();
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, _count: { select: { entries: true } } } });
  if (!project) return NextResponse.json({ error: t.api.projectNotFound }, { status: 404, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  if (!canDeleteProject(me.role, project._count.entries)) return NextResponse.json({ error: t.api.projectHasEntries }, { status: 409, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  try {
    await prisma.project.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: t.api.projectHasEntries }, { status: 409, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  }
  return NextResponse.json({ ok: true }, desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : undefined);
  });
}
