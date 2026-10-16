export function backupAuthorization(role: "OWNER" | "ADMIN" | "USER" | null) {
  if (!role) return "unauthorized" as const;
  if (role !== "OWNER") return "forbidden" as const;
  return null;
}
