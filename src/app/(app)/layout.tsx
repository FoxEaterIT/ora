import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { ensureOwner } from "@/lib/seed";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureOwner();
  const owner = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { passwordHash: true } });
  if (owner && !owner.passwordHash) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Shell user={publicUser(user)}>{children}</Shell>;
}
