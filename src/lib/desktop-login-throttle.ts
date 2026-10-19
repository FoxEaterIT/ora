import type { SessionDb } from "@/lib/desktop-session";
import { prisma } from "@/lib/prisma";
import { desktopLoginKey } from "@/lib/desktop-session";

export async function desktopLoginDelay(ip: string, email: string, db: SessionDb = prisma) {
  const attempt = await db.desktopLoginAttempt.findUnique({ where: { key: desktopLoginKey(ip, email) } });
  return Math.max(0, (attempt?.blockedUntil.getTime() ?? 0) - Date.now());
}

export async function recordDesktopLoginFailure(ip: string, email: string, db: SessionDb = prisma) {
  const now = Date.now();
  const key = desktopLoginKey(ip, email);
  const previous = await db.desktopLoginAttempt.findUnique({ where: { key } });
  const failures = (previous?.failures ?? 0) + 1;
  const delaySeconds = Math.min(30, 2 ** Math.min(failures, 5));
  await db.desktopLoginAttempt.upsert({
    where: { key },
    create: { key, failures, blockedUntil: new Date(now + delaySeconds * 1000) },
    update: { failures, blockedUntil: new Date(now + delaySeconds * 1000) },
  });
}

export async function clearDesktopLoginFailures(ip: string, email: string, db: SessionDb = prisma) {
  await db.desktopLoginAttempt.deleteMany({ where: { key: desktopLoginKey(ip, email) } });
}
