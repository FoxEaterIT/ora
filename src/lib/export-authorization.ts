import { isManager } from "@/lib/auth";
import { NextResponse } from "next/server";

export function exportAuthorization(role: "OWNER" | "ADMIN" | "USER" | null) {
  if (!role) return "unauthorized" as const;
  if (!isManager(role)) return "forbidden" as const;
  return null;
}

export function exportAuthorizationResponse(role: "OWNER" | "ADMIN" | "USER" | null, messages: { unauthorized: string; forbidden: string }) {
  const error = exportAuthorization(role);
  if (!error) return null;
  return NextResponse.json({ error: messages[error] }, { status: error === "unauthorized" ? 401 : 403 });
}
