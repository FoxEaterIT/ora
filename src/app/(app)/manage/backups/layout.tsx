import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function BackupsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/");
  return children;
}
