export const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim().toLowerCase() || "";
export const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "";
export const OWNER_NAME = process.env.OWNER_NAME?.trim() || "Owner";
export const AUTH_SECRET = process.env.AUTH_SECRET || "";
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim() || "ora_session";
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const APP_ORIGIN = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";

function integerSetting(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} deve essere un numero intero tra ${min} e ${max}.`);
  }
  return value;
}

export const SESSION_DURATION_DAYS = integerSetting("SESSION_DURATION_DAYS", 7, 1, 365);
export const SESSION_DURATION_SECONDS = SESSION_DURATION_DAYS * 60 * 60 * 24;
export const PASSWORD_HASH_ROUNDS = integerSetting("PASSWORD_HASH_ROUNDS", 10, 10, 15);

const placeholderSecrets = new Set(["changeme", "replace-with-a-long-random-secret"]);

export function validateServerConfig() {
  if (!IS_PRODUCTION) return;

  if (!AUTH_SECRET || placeholderSecrets.has(AUTH_SECRET)) {
    throw new Error("In produzione AUTH_SECRET deve essere impostato con un valore casuale e non predefinito.");
  }
  if (OWNER_PASSWORD && placeholderSecrets.has(OWNER_PASSWORD)) {
    throw new Error("In produzione OWNER_PASSWORD non può usare un valore segnaposto.");
  }
  if (Boolean(OWNER_EMAIL) !== Boolean(OWNER_PASSWORD)) {
    throw new Error("Configurare insieme OWNER_EMAIL e OWNER_PASSWORD, oppure lasciare entrambe vuote per il setup iniziale.");
  }
}
export const DEFAULT_PROJECT_COLOR = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_COLOR?.trim() || "#14b8a6";
export const DEFAULT_TEAM_COLOR = process.env.NEXT_PUBLIC_DEFAULT_TEAM_COLOR?.trim() || "#6366f1";
