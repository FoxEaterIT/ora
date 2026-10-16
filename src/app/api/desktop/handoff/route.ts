import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Volatile maps are intentional for this preview; production needs durable/shared storage and secure desktop token storage.
const grants = new Map<string, { userId: string; expiresAt: number }>();
const desktopSessions = new Map<string, { userId: string; expiresAt: number }>();
const noStore = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  for (const [key, grant] of grants) if (grant.expiresAt <= Date.now()) grants.delete(key);
  for (const [key, session] of desktopSessions) if (session.expiresAt <= Date.now()) desktopSessions.delete(key);
  const token = randomBytes(32).toString("base64url");
  grants.set(hash(token), { userId: user.id, expiresAt: Date.now() + 60_000 });
  return NextResponse.json({ code: token }, { headers: noStore });
}
export async function issueDesktopSession(userId: string) {
  for (const [key, session] of desktopSessions) if (session.expiresAt <= Date.now()) desktopSessions.delete(key);
  const session = randomBytes(32).toString("base64url");
  desktopSessions.set(hash(session), { userId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return session;
}

export async function consumeDesktopHandoff(token: string) {
  const key = hash(token), grant = grants.get(key);
  grants.delete(key);
  if (!grant || grant.expiresAt <= Date.now()) return null;
  const user = await prisma.user.findUnique({ where: { id: grant.userId } });
  if (!user || user.deactivatedAt) return null;
  const session = await issueDesktopSession(user.id);
  return { user, session };
}
export async function revokeDesktopSession(token: string) {
  desktopSessions.delete(hash(token));
}

export async function getDesktopUser(token: string) {
  const key = hash(token), session = desktopSessions.get(key);
  if (!session || session.expiresAt <= Date.now()) { desktopSessions.delete(key); return null; }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && !user.deactivatedAt ? user : null;
}
