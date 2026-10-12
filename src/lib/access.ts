import { prisma } from "./prisma";
import type { User } from "@prisma/client";
import { isManager } from "./auth";

/** Projects the user can record time against. */
export async function trackableProjects(user: User) {
  if (isManager(user.role)) {
    return prisma.project.findMany({
      where: { archived: false },
      include: { team: true },
      orderBy: { name: "asc" },
    });
  }

  const teams = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  });

  return prisma.project.findMany({
    where: {
      archived: false,
      OR: [
        { members: { some: { userId: user.id } } },
        { teamId: { in: teams.map((t) => t.teamId) } },
      ],
    },
    include: { team: true },
    orderBy: { name: "asc" },
  });
}

export async function canTrack(user: User, projectId: string) {
  const projects = await trackableProjects(user);
  return projects.some((p) => p.id === projectId);
}
