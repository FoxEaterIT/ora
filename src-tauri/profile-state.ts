export interface ServerProfile {
  id: string;
  name: string;
  origin: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROFILE_KEY = 'ora-desktop-profiles';
export const ACTIVE_PROFILE_KEY = 'ora-desktop-active-profile';

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readProfiles(storage: StorageLike): ServerProfile[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PROFILE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const result: ServerProfile[] = [];
    const origins = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.origin !== 'string') continue;
      const origin = normalizeOrigin(item.origin);
      if (!origin || origin !== item.origin || origins.has(origin)) continue;
      origins.add(origin);
      result.push({ id: item.id, name: item.name, origin });
    }
    return result;
  } catch {
    return [];
  }
}

export function saveProfile(storage: StorageLike, originValue: string, name: string, id: () => string): ServerProfile {
  const origin = normalizeOrigin(originValue);
  if (!origin) throw new Error('invalid-origin');
  const profiles = readProfiles(storage);
  const existing = profiles.find(profile => profile.origin === origin);
  if (existing) throw new Error('duplicate-origin');
  const profile = { id: id(), origin, name: name.trim() || new URL(origin).hostname };
  profiles.push(profile);
  storage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  storage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  storage.setItem('ora-desktop-server', profile.origin);
  return profile;
}

export function selectProfile(storage: StorageLike, id: string): ServerProfile | null {
  const profile = readProfiles(storage).find(item => item.id === id) || null;
  if (!profile) return null;
  storage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  storage.setItem('ora-desktop-server', profile.origin);
  return profile;
}

export function activeProfile(storage: StorageLike): ServerProfile | null {
  const id = storage.getItem(ACTIVE_PROFILE_KEY);
  return id ? readProfiles(storage).find(profile => profile.id === id) || null : null;
}

export function removeProfile(storage: StorageLike, id: string): ServerProfile[] {
  const remaining = readProfiles(storage).filter(profile => profile.id !== id);
  storage.setItem(PROFILE_KEY, JSON.stringify(remaining));
  if (storage.getItem(ACTIVE_PROFILE_KEY) === id) {
    const next = remaining[0];
    if (next) selectProfile(storage, next.id);
    else {
      storage.removeItem(ACTIVE_PROFILE_KEY);
      storage.removeItem('ora-desktop-server');
    }
  }
  return remaining;
}

export function isHttpOriginApproved(storage: StorageLike, originValue: string): boolean {
  const origin = normalizeOrigin(originValue);
  return !!origin && new URL(origin).protocol === 'http:' && storage.getItem(`ora-approved-http-origin:${origin}`) === 'yes';
}

export function approveHttpOrigin(storage: StorageLike, originValue: string): boolean {
  const origin = normalizeOrigin(originValue);
  if (!origin || new URL(origin).protocol !== 'http:') return false;
  storage.setItem(`ora-approved-http-origin:${origin}`, 'yes');
  return true;
}
