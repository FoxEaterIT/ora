import { prisma } from "./prisma";
import { hashPassword } from "./auth";

import { OWNER_EMAIL, OWNER_NAME, OWNER_PASSWORD, validateServerConfig } from "./server-config";
import { getOrCreateSetupCode } from "./setup-code";

export const PENDING_OWNER_EMAIL = "initial-owner@setup.invalid";

let initialization: Promise<void> | null = null;

/** Create the initial owner from environment settings or a temporary account for setup completion. */
export async function ensureOwner() {
  validateServerConfig();
  if (!initialization) {
    initialization = initializeOwner().catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
}

async function initializeOwner() {
  const email = OWNER_EMAIL;
  // Preserve exactly one OWNER. Env credentials are only for initial provisioning.
  const owners = await prisma.user.findMany({ where: { role: "OWNER" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (owners.length > 0) {
    if (owners.length > 1) {
      await prisma.user.updateMany({ where: { role: "OWNER", id: { not: owners[0].id } }, data: { role: "ADMIN" } });
    }
    if (!OWNER_EMAIL && !owners[0].passwordHash && owners[0].email === PENDING_OWNER_EMAIL) await getOrCreateSetupCode();
    return;
  }

  const configuredEmail = email || PENDING_OWNER_EMAIL;
  const existing = email ? await prisma.user.findUnique({ where: { email: configuredEmail } }) : null;
  if (existing && existing.role !== "OWNER") {
    throw new Error("OWNER_EMAIL corrisponde a un account esistente non owner. Scegliere un indirizzo dedicato per il provisioning iniziale.");
  }
  if (!existing) {
    const password = OWNER_PASSWORD || null;
    if (!password && email) return;
    const [firstName, ...lastName] = OWNER_NAME.split(/\s+/);
    await prisma.user.create({
      data: {
        email: configuredEmail,
        firstName,
        lastName: lastName.join(" "),
        passwordHash: password ? await hashPassword(password) : null,
        role: "OWNER",
      },
    });
  }

  if (!email && !OWNER_PASSWORD) await getOrCreateSetupCode();
}
