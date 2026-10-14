import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, publicUser, setSession } from "@/lib/auth";
import { ensureOwner, PENDING_OWNER_EMAIL } from "@/lib/seed";
import { OWNER_EMAIL, OWNER_PASSWORD } from "@/lib/server-config";
import { removeSetupCode, verifySetupCode } from "@/lib/setup-code";
import { requestMessages } from "@/i18n/request";

const schema = z.object({
  code: z.string().length(64),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
});

export async function GET() {
  await ensureOwner();
  const owner = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { passwordHash: true, email: true } });
  return NextResponse.json({ setupRequired: !OWNER_EMAIL && !OWNER_PASSWORD && Boolean(owner && !owner.passwordHash && owner.email === PENDING_OWNER_EMAIL) });
}

export async function POST(request: Request) {
  await ensureOwner();
  const t = await requestMessages();
  if (OWNER_EMAIL && OWNER_PASSWORD) {
    return NextResponse.json({ error: t.api.ownerConfigured }, { status: 409 });
  }
  const pendingOwner = await prisma.user.findFirst({ where: { role: "OWNER", passwordHash: null, email: PENDING_OWNER_EMAIL } });
  if (!pendingOwner) return NextResponse.json({ error: t.api.setupCompleted }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "confirmPassword");
    return NextResponse.json({ error: mismatch ? t.api.passwordMismatch : t.api.invalidData }, { status: 400 });
  }
  if (!(await verifySetupCode(parsed.data.code))) {
    return NextResponse.json({ error: t.api.invalidSetupCode }, { status: 403 });
  }

  const configuredOwner = pendingOwner;

  const email = parsed.data.email.trim().toLowerCase();
  const duplicate = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (duplicate && duplicate.id !== configuredOwner.id) return NextResponse.json({ error: t.api.emailInUse }, { status: 409 });
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await prisma.user.updateMany({
    where: { id: configuredOwner.id, role: "OWNER", passwordHash: null, email: PENDING_OWNER_EMAIL },
    data: { email, passwordHash },
  });
  if (result.count !== 1) return NextResponse.json({ error: t.api.setupCompleted }, { status: 409 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: configuredOwner.id } });
  await setSession(user.id);
  await removeSetupCode();
  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}

