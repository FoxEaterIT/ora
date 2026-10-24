import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { canTrack } from "@/lib/access";
import { fullName } from "@/lib/users";
import { requestMessages } from "@/i18n/request";
import { canDeleteEntry } from "@/lib/entry-policy";
import { desktopUserForAllowedRoute, desktopForbidden, runWithDesktopRequest } from "@/lib/desktop-auth";

const schema = z.object({
  projectId: z.string().optional(),
  description: z.string().trim().max(300).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().nullable().optional(),
});

function serializeDesktopEntry(entry: {
  id: string;
  userId: string;
  projectId: string;
  description: string;
  start: Date;
  end: Date | null;
  createdAt: Date;
  project: { id: string; name: string; color: string; archived: boolean; team: { id: string; name: string } | null };
  user: { id: string; firstName: string; lastName: string; email: string };
}) {
  return {
    id: entry.id,
    userId: entry.userId,
    projectId: entry.projectId,
    description: entry.description,
    start: entry.start,
    end: entry.end,
    createdAt: entry.createdAt,
    project: { id: entry.project.id, name: entry.project.name, color: entry.project.color, archived: entry.project.archived, team: entry.project.team },
    user: { id: entry.user.id, firstName: entry.user.firstName, lastName: entry.user.lastName, email: entry.user.email, name: fullName(entry.user) },
  };
}

async function loadOwned(id: string, userId: string, manager: boolean, messages: Awaited<ReturnType<typeof requestMessages>>) {
  const entry = await prisma.timeEntry.findUnique({ where: { id } });
  if (!entry) return { error: messages.api.entryNotFound, status: 404 as const };
  if (!manager && entry.userId !== userId) return { error: messages.api.ownEntriesOnly, status: 403 as const };
  return { entry };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithDesktopRequest(request, async () => {
  const desktop = await desktopUserForAllowedRoute(request.url);
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });

  const { id } = await params;
  const loaded = await loadOwned(id, me.id, desktop.desktop ? false : isManager(me.role), t);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  const existing = loaded.entry;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidData }, { status: 400, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });

  const projectId = parsed.data.projectId ?? existing.projectId;
  const owner = existing.userId === me.id ? me : await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!owner || !(await canTrack(owner, projectId))) {
    return NextResponse.json({ error: t.api.projectNotAssigned }, { status: 403, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  }

  const start = parsed.data.start ? new Date(parsed.data.start) : existing.start;
  const end = parsed.data.end === undefined ? existing.end : parsed.data.end ? new Date(parsed.data.end) : null;
  if (end && end <= start) {
    return NextResponse.json({ error: t.api.endAfterStart }, { status: 400, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  }

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: { projectId, description: parsed.data.description, start, end },
    include: { project: { include: { team: true } }, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  return NextResponse.json({ entry: desktop.desktop ? serializeDesktopEntry(entry) : { ...entry, user: { ...entry.user, name: fullName(entry.user) } } }, desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : undefined);
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithDesktopRequest(_request, async () => {
  const desktop = await desktopUserForAllowedRoute(_request.url);
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });

  const { id } = await params;
  const loaded = await loadOwned(id, me.id, desktop.desktop ? false : isManager(me.role), t);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });
  if (!canDeleteEntry(me.id, loaded.entry.userId)) return NextResponse.json({ error: t.api.ownEntriesOnly }, { status: 403, ...(desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : {}) });

  await prisma.timeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true }, desktop.desktop ? { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } } : undefined);
  });
}
