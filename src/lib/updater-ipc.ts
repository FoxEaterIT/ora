import { spawn } from "node:child_process";
import path from "node:path";

export type UpdaterStatus = {
  phase: "idle" | "queued" | "downloading" | "verifying" | "building" | "stopping" | "migrating" | "activating" | "restarting" | "succeeded" | "failed";
  message: string;
  targetVersion: string;
  updatedAt: string;
};

const IDLE: UpdaterStatus = { phase: "idle", message: "", targetVersion: "", updatedAt: new Date(0).toISOString() };
const CLIENT = path.join(process.cwd(), "scripts", "updater-client.ps1");

export async function callUpdater(operation: "status" | "start"): Promise<unknown> {
  if (process.platform !== "win32") throw new Error("Updater service is only available on Windows.");
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", CLIENT, "-Operation", operation], { windowsHide: true, timeout: 2500 });
    let output = "";
    let error = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { error += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(error || "Updater service is unavailable."));
      try { resolve(JSON.parse(output.trim())); } catch { reject(new Error("Updater service returned invalid status.")); }
    });
  });
}

export function sanitizeUpdaterStatus(value: unknown): UpdaterStatus {
  if (!value || typeof value !== "object") return IDLE;
  const candidate = value as Record<string, unknown>;
  const phases: UpdaterStatus["phase"][] = ["idle", "queued", "downloading", "verifying", "building", "stopping", "migrating", "activating", "restarting", "succeeded", "failed"];
  return {
    phase: phases.includes(candidate.phase as UpdaterStatus["phase"]) ? candidate.phase as UpdaterStatus["phase"] : "idle",
    message: typeof candidate.message === "string" ? candidate.message.slice(0, 200) : "",
    targetVersion: typeof candidate.targetVersion === "string" && /^\d+\.\d+\.\d+$/.test(candidate.targetVersion) ? candidate.targetVersion : "",
    updatedAt: typeof candidate.updatedAt === "string" && !Number.isNaN(Date.parse(candidate.updatedAt)) ? candidate.updatedAt : IDLE.updatedAt,
  };
}
