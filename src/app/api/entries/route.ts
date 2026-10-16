import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { canTrack } from "@/lib/access";
import { fullName } from "@/lib/users";
import { requestMessages } from "@/i18n/request";
import { desktopUserForAllowedRoute, desktopForbidden } from "@/lib/desktop-auth";

const createEntrySchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().max(300).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().nullable().optional(),
});

/** Lists the current user's entries, or filtered entries for managers. */
export async function GET(request: Request) {
  const desktop = await desktopUserForAllowedRoute("/api/entries");
  if (desktop.desktop && new URL(request.url).searchParams.get("mine") !== "1") return desktopForbidden();
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  if (!me) return NextResponse.json({ error: (await requestMessages()).api.unauthenticated }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userIds = [...new Set(url.searchParams.getAll("userId").filter(Boolean))];
  const includeDeactivated = url.searchParams.get("includeDeactivated") === "1" && isManager(me.role);
  const projectIds = [...new Set(url.searchParams.getAll("projectId").filter(Boolean))];
  const teamIds = [...new Set(url.searchParams.getAll("teamId").filter(Boolean))];
  const mine = url.searchParams.get("mine") === "1";

  const where = {
    ...(from || to ? { start: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(projectIds.length ? { projectId: { in: projectIds } } : {}),
    ...(teamIds.length ? { project: { teamId: { in: teamIds } } } : {}),
    ...(!isManager(me.role) || mine ? { userId: me.id } : userIds.length ? { userId: { in: userIds } } : {}),
    ...(isManager(me.role) && !mine ? (
      includeDeactivated
        ? (userIds.length ? { user: { OR: [{ deactivatedAt: null }, { id: { in: userIds } }] } } : {})
        : { user: { deactivatedAt: null } }
    ) : {}),
  };

  const entries = await prisma.timeEntry.findMany({
    where,
    include: {
      project: { include: { team: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { start: "desc" },
  });

  return NextResponse.json({
    entries: entries.map((entry) => ({
      ...entry,
      user: { ...entry.user, name: fullName(entry.user) },
    })),
  });
}

/** Starts either a timer or a manually entered, completed time entry. */
export async function POST(request: Request) {
  const desktop = await desktopUserForAllowedRoute("/api/entries");
  const me = desktop.desktop ? desktop.user : await getCurrentUser();
  if (desktop.desktop && !me) return desktopForbidden();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });

  const parsed = createEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidData }, { status: 400 });
  if (!(await canTrack(me, parsed.data.projectId))) {
    return NextResponse.json({ error: t.api.cannotTrackProject }, { status: 403 });
  }

  const running = await prisma.timeEntry.findFirst({ where: { userId: me.id, end: null } });
  if (running && !parsed.data.end) {
    return NextResponse.json({ error: t.api.timerAlreadyRunning }, { status: 409 });
  }

  try {
    const start = parsed.data.start ? new Date(parsed.data.start) : new Date();
    const end = parsed.data.end ? new Date(parsed.data.end) : null;
    if (end && end <= start) {
      return NextResponse.json({ error: t.api.endAfterStart }, { status: 400 });
    }

    const entry = await prisma.timeEntry.create({
      data: { userId: me.id, projectId: parsed.data.projectId, description: parsed.data.description ?? "", start, end },
      include: {
        project: { include: { team: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ entry: { ...entry, user: { ...entry.user, name: fullName(entry.user) } } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint failed")) {
      return NextResponse.json({ error: t.api.timerAlreadyRunning }, { status: 409 });
    }
    throw error;
  }
}
