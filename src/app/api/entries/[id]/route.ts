import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { canTrack } from "@/lib/access";
import { fullName } from "@/lib/users";
import { requestMessages } from "@/i18n/request";
import { canDeleteEntry } from "@/lib/entry-policy";
import { desktopUserForAllowedRoute, desktopForbidden } from "@/lib/desktop-auth";

const schema = z.object({
  projectId: z.string().optional(),
  description: z.string().trim().max(300).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().nullable().optional(),
});

async function loadOwned(id: string, userId: string, manager: boolean, messages: Awaited<ReturnType<typeof requestMessages>>) {
  const entry = await prisma.timeEntry.findUnique({ where: { id } });
  if (!entry) return { error: messages.api.entryNotFound, status: 404 as const };
  if (!manager && entry.userId !== userId) return { error: messages.api.ownEntriesOnly, status: 403 as const };
  return { entry };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const desktop = await desktopUserForAllowedRoute("/api/entries");
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });

  const { id } = await params;
  const loaded = await loadOwned(id, me.id, isManager(me.role), t);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const existing = loaded.entry;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidData }, { status: 400 });

  const projectId = parsed.data.projectId ?? existing.projectId;
  const owner = existing.userId === me.id ? me : await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!owner || !(await canTrack(owner, projectId))) {
    return NextResponse.json({ error: t.api.projectNotAssigned }, { status: 403 });
  }

  const start = parsed.data.start ? new Date(parsed.data.start) : existing.start;
  const end = parsed.data.end === undefined ? existing.end : parsed.data.end ? new Date(parsed.data.end) : null;
  if (end && end <= start) {
    return NextResponse.json({ error: t.api.endAfterStart }, { status: 400 });
  }

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: { projectId, description: parsed.data.description, start, end },
    include: { project: { include: { team: true } }, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  return NextResponse.json({ entry: { ...entry, user: { ...entry.user, name: fullName(entry.user) } } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const desktop = await desktopUserForAllowedRoute("/api/entries");
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });

  const { id } = await params;
  const loaded = await loadOwned(id, me.id, isManager(me.role), t);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (!canDeleteEntry(me.id, loaded.entry.userId)) return NextResponse.json({ error: t.api.ownEntriesOnly }, { status: 403 });

  await prisma.timeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
