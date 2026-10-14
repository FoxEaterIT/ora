import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates a consistent SQLite snapshot using SQLite's online backup operation. */
export async function GET() {
  const me = await getCurrentUser();
  const t = await requestMessages();
  if (!me) return NextResponse.json({ error: t.api.unauthenticated }, { status: 401 });
  if (!isManager(me.role)) return NextResponse.json({ error: t.api.forbidden }, { status: 403 });

  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-backup-"));
  const snapshot = path.join(directory, "ORA.db");
  try {
    const sqlPath = snapshot.replaceAll("'", "''").replaceAll("\\", "/");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);
    const contents = await readFile(snapshot);
    const body = new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="ora-backup-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}.db"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: t.api.backupFailed }, { status: 500, headers: { "Cache-Control": "no-store" } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
