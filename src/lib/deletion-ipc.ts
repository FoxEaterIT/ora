import { spawn } from "node:child_process";
import path from "node:path";

export type DeletionStatus = {
  phase: "idle" | "preparing" | "stopping" | "removing" | "succeeded" | "failed";
  message: string;
  updatedAt: string;
};

const IDLE: DeletionStatus = { phase: "idle", message: "", updatedAt: new Date(0).toISOString() };
const CLIENT = path.join(process.cwd(), "scripts", "deletion-ipc.ps1");

export async function callDeletion(operation: "status" | "start", keepData = false, createExcel = true): Promise<unknown> {
  if (process.platform !== "win32") throw new Error("Deletion service is only available on Windows.");
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", CLIENT, "-Operation", operation, "-KeepData", String(keepData).toLowerCase(), "-CreateExcel", String(createExcel).toLowerCase()], { windowsHide: true, timeout: 3500 });
    let output = "";
    let error = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { error += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(error || "Deletion service is unavailable."));
      try { resolve(JSON.parse(output.trim())); } catch { reject(new Error("Deletion service returned invalid status.")); }
    });
  });
}

export function sanitizeDeletionStatus(value: unknown): DeletionStatus {
  if (!value || typeof value !== "object") return IDLE;
  const candidate = value as Record<string, unknown>;
  const phases: DeletionStatus["phase"][] = ["idle", "preparing", "stopping", "removing", "succeeded", "failed"];
  return {
    phase: phases.includes(candidate.phase as DeletionStatus["phase"]) ? candidate.phase as DeletionStatus["phase"] : "idle",
    message: typeof candidate.message === "string" ? candidate.message.slice(0, 300) : "",
    updatedAt: typeof candidate.updatedAt === "string" && !Number.isNaN(Date.parse(candidate.updatedAt)) ? candidate.updatedAt : IDLE.updatedAt,
  };
}
