import { NextResponse } from "next/server";
import { buildFullBackupZip } from "@/lib/full-backup";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";
import { backupAuthorization } from "@/lib/backup-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates a complete set of linked Excel workbooks for the installation owner. */
export async function GET() {
  const me = await getCurrentUser();
  const t = await requestMessages();
  const access = backupAuthorization(me?.role ?? null);
  if (access) return NextResponse.json({ error: access === "unauthorized" ? t.api.unauthenticated : t.api.forbidden }, { status: access === "unauthorized" ? 401 : 403 });

  try {
    const [projects, people, teams] = await Promise.all([
      prisma.project.findMany({
        include: {
          team: { select: { id: true, name: true } },
          entries: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            orderBy: { start: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        include: {
          entries: {
            include: { project: { select: { id: true, name: true } } },
            orderBy: { start: "asc" },
          },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.team.findMany({
        include: {
          members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          projects: {
            include: {
              entries: {
                include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
                orderBy: { start: "asc" },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    const name = (user: { firstName: string; lastName: string }) => `${user.firstName} ${user.lastName}`.trim();
    const archive = await buildFullBackupZip({
      projects: projects.map((project) => ({
        ...project,
        entries: project.entries.map((entry) => ({ ...entry, user: { ...entry.user, name: name(entry.user) } })),
      })),
      people: people.map((person) => ({
        ...person,
        name: name(person),
        entries: person.entries.map((entry) => ({ ...entry, project: entry.project })),
      })),
      teams: teams.map((team) => ({
        ...team,
        members: team.members.map((member) => ({ ...member, user: { ...member.user, name: name(member.user) } })),
        projects: team.projects.map((project) => ({
          ...project,
          entries: project.entries.map((entry) => ({ ...entry, user: { ...entry.user, name: name(entry.user) } })),
        })),
      })),
    });
    return new NextResponse(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ora-full-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: t.api.backupFailed }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
