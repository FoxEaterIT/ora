import { createHash, randomBytes } from "crypto";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";

export const DESKTOP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionDb = Prisma.TransactionClient | typeof prisma;

export function hashDesktopToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function desktopLoginKey(ip: string, email: string) {
  return createHash("sha256").update(`${ip}\n${email.trim().toLowerCase()}`).digest("hex").slice(0, 16);
}

/** Issues one opaque token and revokes any other live desktop session for the user. The raw token is returned once. */
export async function issueDesktopSession(userId: string, db: SessionDb = prisma) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const persist = async (client: SessionDb) => {
    const account = await client.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true, passwordHash: true } });
    if (account && (account.deactivatedAt || !account.passwordHash)) throw new Error("DESKTOP_LOGIN_NOT_ALLOWED");
    await client.desktopSession.updateMany({
      where: { userId, revokedAt: null, expiresAt: { lte: now } },
      data: { revokedAt: now, revokeReason: "expired" },
    });
    await client.desktopSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: "replaced" },
    });
    await client.desktopSession.create({
      data: {
        userId,
        tokenHash: hashDesktopToken(token),
        expiresAt: new Date(now.getTime() + DESKTOP_SESSION_TTL_MS),
      },
    });
  };
  if (db === prisma) await prisma.$transaction((tx) => persist(tx));
  else await persist(db);
  return token;
}

export async function revokeDesktopSession(token: string, reason = "logout", db: SessionDb = prisma) {
  if (!token) return;
  await db.desktopSession.updateMany({
    where: { tokenHash: hashDesktopToken(token), revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

export async function revokeDesktopSessionsForUser(userId: string, reason: string, db: SessionDb = prisma, now = new Date()) {
  await db.desktopSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason },
  });
}

/** Resolves a live desktop session. Expired and revoked tokens return null; deactivation revokes the user's sessions. */
export async function getDesktopUser(token: string, db: SessionDb = prisma): Promise<User | null> {
  if (!token) return null;
  const session = await db.desktopSession.findUnique({
    where: { tokenHash: hashDesktopToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;
  const now = new Date();
  if (session.expiresAt <= now) {
    await db.desktopSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: "expired" },
    });
    return null;
  }
  if (session.user.deactivatedAt) {
    await revokeDesktopSessionsForUser(session.userId, "deactivated", db, now);
    return null;
  }
  return session.user;
}
