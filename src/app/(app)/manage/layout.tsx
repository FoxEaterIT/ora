import { redirect } from "next/navigation";
import { isManager, requireUser } from "@/lib/auth";

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!isManager(user.role)) redirect("/");
  return children;
}
