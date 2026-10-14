import { randomBytes, timingSafeEqual } from "crypto";
import { chmod, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

const codePath = path.join(process.cwd(), "owner-setup-code.txt");

async function writeSetupCode(code: string) {
  try {
    await writeFile(codePath, `${code}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return (await readFile(codePath, "utf8")).trim();
  }
  try {
    await chmod(codePath, 0o600);
  } catch {
    // chmod is best-effort; unsupported on some platforms.
  }
  return code;
}

export async function getOrCreateSetupCode() {
  try {
    const current = (await readFile(codePath, "utf8")).trim();
    if (current) return current;
  } catch {
    // File is created on first setup attempt.
  }
  const code = randomBytes(32).toString("hex");
  return writeSetupCode(code);
}

export async function verifySetupCode(candidate: string) {
  try {
    const expected = (await readFile(codePath, "utf8")).trim();
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function removeSetupCode() {
  await unlink(codePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function removeSetupCodeAfterCommit(remove = removeSetupCode) {
  await remove().catch(() => undefined);
}
