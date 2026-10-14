import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/server-config";
import { getCurrentUser, isManager, publicUser } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";

const schema = z.object({
  role: z.enum(["ADMIN", "USER"]).optional(),
  email: z.string().trim().email().max(254).optional(),
  resetPassword: z.literal(true).optional(),
  reactivate: z.literal(true).optional(),
}).refine((data) => data.role !== undefined || data.email !== undefined || data.resetPassword === true || data.reactivate === true);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (me.role !== "OWNER") {
    return NextResponse.json({ error: t.api.ownerChangesRoles }, { status: 403 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.api.invalidUser }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: t.api.userNotFound }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: t.api.ownerManagedInAccount }, { status: 403 });
  }
  if (target.role === "ADMIN" && me.role !== "OWNER") {
    return NextResponse.json({ error: t.api.ownerChangesRoles }, { status: 403 });
  }

  if (target.deactivatedAt && parsed.data.reactivate !== true) {
    return NextResponse.json({ error: t.api.userNotFound }, { status: 404 });
  }
  if (parsed.data.reactivate && (me.role !== "OWNER" || !target.deactivatedAt)) {
    return NextResponse.json({ error: t.api.forbidden }, { status: 403 });
  }

  const email = parsed.data.email?.trim().toLowerCase();
  if (email && email !== target.email.toLowerCase()) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: t.api.emailUsedByAnother }, { status: 409 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(email ? { email } : {}),
        ...(parsed.data.resetPassword ? { passwordHash: null } : {}),
        ...(parsed.data.reactivate ? { deactivatedAt: null } : {}),
      },
    });
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: t.api.emailUsedByAnother }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.deactivatedAt) return NextResponse.json({ error: t.api.userNotFound }, { status: 404 });
  if (target.role === "OWNER" || target.email === OWNER_EMAIL) {
    return NextResponse.json({ error: t.api.cannotDeleteConfiguredOwner }, { status: 403 });
  }
  if (id === me.id) return NextResponse.json({ error: t.api.cannotDeleteSelf }, { status: 400 });
  if (target.role === "ADMIN" && me.role !== "OWNER") {
    return NextResponse.json({ error: t.api.ownerDeletesAdmin }, { status: 403 });
  }

  await prisma.user.update({ where: { id }, data: { deactivatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
