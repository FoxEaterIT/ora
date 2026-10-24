import { normalizeOrigin } from './profile-state';

export interface CredentialStore {
  load(account: string): Promise<string | null>;
  remove(account: string): Promise<void>;
}

export interface SessionAdapters {
  accountForOrigin(origin: string): Promise<string>;
  credentials: CredentialStore;
  logout(origin: string, token: string): Promise<void>;
}

/** Prevent an older in-flight connection from publishing state after a profile switch. */
export class ProfileSessionGate {
  private generation = 0;

  /** Reserve the next generation before awaiting credentials or network operations. */
  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  current(): number {
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }
}

/** A request may complete only while both its profile origin and session generation remain current. */
export function isCurrentProfileRequest(
  requestOrigin: string,
  activeOrigin: string,
  requestGeneration: number,
  gate: ProfileSessionGate,
): boolean {
  return requestOrigin === activeOrigin && gate.isCurrent(requestGeneration);
}

/** Resolve an asynchronous profile operation only if it still belongs to the active profile. */
export async function resolveForActiveProfile<T>(
  operation: Promise<T>,
  origin: string,
  activeOrigin: () => string,
  generation: number,
  gate: ProfileSessionGate,
): Promise<T | null> {
  try {
    const result = await operation;
    return isCurrentProfileRequest(origin, activeOrigin(), generation, gate) ? result : null;
  } catch (error) {
    if (!isCurrentProfileRequest(origin, activeOrigin(), generation, gate)) return null;
    throw error;
  }
}

/** Load only the credential derived from this profile's exact normalized origin. */
function validatedOrigin(value: string): string {
  const origin = normalizeOrigin(value);
  if (!origin || origin !== value) throw new Error('invalid-origin');
  return origin;
}

export async function restoreProfileToken(origin: string, adapters: SessionAdapters): Promise<string | null> {
  const account = await adapters.accountForOrigin(validatedOrigin(origin));
  return adapters.credentials.load(account);
}

/** Discard a credential only when the server explicitly rejects its session. */
export async function discardRejectedProfileToken(
  origin: string,
  status: number,
  adapters: SessionAdapters,
): Promise<boolean> {
  if (status !== 401 && status !== 403) return false;
  await removeProfileToken(origin, adapters);
  return true;
}

/** Logout is best-effort: its failure must not redirect the next profile's credential lookup. */
export async function switchProfileToken(
  previous: { origin: string; token: string } | null,
  nextOrigin: string,
  adapters: SessionAdapters,
): Promise<string | null> {
  const next = validatedOrigin(nextOrigin);
  if (previous) {
    try {
      await adapters.logout(validatedOrigin(previous.origin), previous.token);
    } catch {
      // Offline old servers must not prevent switching profiles.
    }
  }
  return restoreProfileToken(next, adapters);
}

/** Delete only the credential belonging to the origin being signed out. */
export async function removeProfileToken(origin: string, adapters: SessionAdapters): Promise<void> {
  const account = await adapters.accountForOrigin(validatedOrigin(origin));
  await adapters.credentials.remove(account);
}
