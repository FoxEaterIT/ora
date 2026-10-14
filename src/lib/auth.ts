import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role, User } from "@prisma/client";
import { fullName } from "./users";
import { AUTH_SECRET, IS_PRODUCTION, PASSWORD_HASH_ROUNDS, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./server-config";


function secret() {
  if (!AUTH_SECRET) throw new Error("AUTH_SECRET mancante nel file .env");
  return AUTH_SECRET;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string) {
  const exp = Date.now() + SESSION_DURATION_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, mac] = parts;
  const payload = `${userId}.${exp}`;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export async function setSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = readSessionToken(store.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.deactivatedAt ? null : user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function isManager(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

export async function requireManager() {
  const user = await requireUser();
  if (!isManager(user.role)) redirect("/");
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  name: fullName(user),
  role: user.role,
  deactivatedAt: user.deactivatedAt,
  passwordSet: Boolean(user.passwordHash),
});
