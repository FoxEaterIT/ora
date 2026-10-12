import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { canTrack } from "@/lib/access";
import { fullName } from "@/lib/users";

const createEntrySchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().max(300).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().nullable().optional(),
});

/** Lists the current user's entries, or filtered entries for managers. */
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userIds = [...new Set(url.searchParams.getAll("userId").filter(Boolean))];
  const projectIds = [...new Set(url.searchParams.getAll("projectId").filter(Boolean))];
  const teamIds = [...new Set(url.searchParams.getAll("teamId").filter(Boolean))];
  const mine = url.searchParams.get("mine") === "1";

  const where = {
    ...(from || to ? { start: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(projectIds.length ? { projectId: { in: projectIds } } : {}),
    ...(teamIds.length ? { project: { teamId: { in: teamIds } } } : {}),
    ...(!isManager(me.role) || mine ? { userId: me.id } : userIds.length ? { userId: { in: userIds } } : {}),
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
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const parsed = createEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  if (!(await canTrack(me, parsed.data.projectId))) {
    return NextResponse.json({ error: "Non puoi registrare tempo su questo progetto." }, { status: 403 });
  }

  const running = await prisma.timeEntry.findFirst({ where: { userId: me.id, end: null } });
  if (running && !parsed.data.end) {
    return NextResponse.json({ error: "Hai già un timer attivo. Fermalo prima di avviarne un altro." }, { status: 409 });
  }

  const start = parsed.data.start ? new Date(parsed.data.start) : new Date();
  const end = parsed.data.end ? new Date(parsed.data.end) : null;
  if (end && end <= start) {
    return NextResponse.json({ error: "L'orario di fine deve essere successivo all'inizio." }, { status: 400 });
  }

  const entry = await prisma.timeEntry.create({
    data: { userId: me.id, projectId: parsed.data.projectId, description: parsed.data.description ?? "", start, end },
    include: {
      project: { include: { team: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return NextResponse.json({ entry: { ...entry, user: { ...entry.user, name: fullName(entry.user) } } }, { status: 201 });
}
