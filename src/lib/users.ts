import type { User } from "@/generated/prisma/client";

/** Full name shared by user-facing lists and reports. */
export function fullName(user: Pick<User, "firstName" | "lastName">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
