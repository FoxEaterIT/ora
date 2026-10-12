import { NextResponse } from "next/server";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { ensureOwner } from "@/lib/seed";

export async function GET() {
  await ensureOwner();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: publicUser(user) });
}
