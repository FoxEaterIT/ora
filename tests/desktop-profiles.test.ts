import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopApiClient } from '../src-tauri/desktop-api';
import { createDesktopProjectsAdapter } from '../src-tauri/projects-adapter';
import { createDesktopMyHoursAdapter } from '../src-tauri/my-hours-adapter';
import { discardRejectedProfileToken, isCurrentProfileRequest, ProfileSessionGate, removeProfileToken, resolveForActiveProfile, restoreProfileToken, switchProfileToken } from '../src-tauri/session-flow';
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_KEY,
  activeProfile,
  approveHttpOrigin,
  isHttpOriginApproved,
  normalizeOrigin,
  readProfiles,
  removeProfile,
  saveProfile,
  selectProfile,
  type StorageLike,
} from '../src-tauri/profile-state';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('normalizes valid origins and rejects credentials or non-root URLs', () => {
  assert.equal(normalizeOrigin(' HTTPS://Ora.Example:443/ '), 'https://ora.example');
  assert.equal(normalizeOrigin('http://ora.example:80'), 'http://ora.example');
  for (const value of ['ftp://ora.example', 'https://u:p@ora.example', 'https://ora.example/path', 'https://ora.example/?x=1', 'https://ora.example/#x', 'not a URL']) {
    assert.equal(normalizeOrigin(value), null, value);
  }
});

test('rejects duplicate normalized origins and stores no credentials', () => {
  const storage = new MemoryStorage();
  let sequence = 0;
  const createId = () => `profile-${++sequence}`;
  const first = saveProfile(storage, 'https://Ora.Example:443/', 'Work', createId);
  assert.throws(() => saveProfile(storage, 'https://ora.example', 'Duplicate', createId), /duplicate-origin/);
  assert.equal(first.origin, 'https://ora.example');
  assert.equal(storage.getItem(PROFILE_KEY)?.includes('token'), false);
  assert.equal(storage.getItem(PROFILE_KEY)?.includes('password'), false);
});

test('switches and removes profiles while maintaining active selection', () => {
  const storage = new MemoryStorage();
  const a = saveProfile(storage, 'https://a.example', 'A', () => 'a');
  saveProfile(storage, 'https://b.example', 'B', () => 'b');
  assert.equal(activeProfile(storage)?.id, 'b');
  assert.equal(selectProfile(storage, a.id)?.origin, a.origin);
  assert.equal(storage.getItem(ACTIVE_PROFILE_KEY), 'a');
  assert.equal(removeProfile(storage, 'a')[0]?.id, 'b');
  assert.equal(activeProfile(storage)?.id, 'b');
  removeProfile(storage, 'b');
  assert.equal(activeProfile(storage), null);
});

test('HTTP approvals are exact-origin scoped and never apply to HTTPS', () => {
  const storage = new MemoryStorage();
  assert.equal(approveHttpOrigin(storage, 'http://one.example'), true);
  assert.equal(isHttpOriginApproved(storage, 'http://one.example/'), true);
  assert.equal(isHttpOriginApproved(storage, 'http://two.example'), false);
  assert.equal(isHttpOriginApproved(storage, 'https://one.example'), false);
  assert.equal(approveHttpOrigin(storage, 'https://one.example'), false);
});

test('shared Projects adapter translates web session bootstrap to the desktop session route', async () => {
  const calls: string[] = [];
  const adapter = createDesktopProjectsAdapter({ request: async <T>(path: string) => { calls.push(path); return {} as T; } });
  await adapter.request('/api/me');
  await adapter.request('/api/projects');
  assert.deepEqual(calls, ['/api/desktop/session', '/api/projects']);
  assert.deepEqual(await adapter.request('/api/users'), { users: [] });
});

test('shared My hours desktop adapter permits only own-entry and project reads', async () => {
  const calls: string[] = [];
  const adapter = createDesktopMyHoursAdapter({ request: async <T>(path: string) => { calls.push(path); return {} as T; } });
  await adapter.request('/api/entries?mine=1');
  await adapter.request('/api/projects');
  assert.deepEqual(calls, ['/api/entries?mine=1', '/api/projects']);
  assert.throws(() => adapter.request('/api/entries'), /desktop-my-hours-operation-not-supported/);
  assert.throws(() => adapter.request('/api/entries?mine=1', { method: 'DELETE' }), /desktop-my-hours-operation-not-supported/);
});

test('desktop API boundary validates path and method, snapshots token, and drops stale responses', async () => {
  const gate = new ProfileSessionGate();
  let origin = 'https://a.example';
  let token: string | null = 'token-a';
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let finish!: (response: Response) => void;
  const allowed = (method: string, pathname: string, search: string) =>
    (method === 'GET' && pathname === '/api/projects' && !search) ||
    (method === 'POST' && pathname === '/api/desktop/login' && !search);
  const client = createDesktopApiClient({
    origin: () => origin,
    token: () => token,
    gate,
    allowed,
    transport: { fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/api/desktop/login')) return new Response('{}', { status: 200 });
      return new Promise(resolve => { finish = resolve; });
    } },
  });
  const pending = client('/api/projects');
  assert.equal(calls[0].url, 'https://a.example/api/projects');
  assert.equal(new Headers(calls[0].init.headers).get('X-Ora-Desktop-Token'), 'token-a');
  origin = 'https://b.example';
  token = 'token-b';
  gate.begin();
  finish(new Response(JSON.stringify({ projects: [] }), { status: 200 }));
  await assert.rejects(pending, /stale-profile-response/);
  await assert.rejects(client('//evil.example/api/projects'), /invalid-api-path/);
  await assert.rejects(client('/api/projects?mine=1'), /api-route-not-allowed/);
  await assert.rejects(createDesktopApiClient({ origin: () => 'https://a.example/path', token: () => 'x', gate, allowed, transport: { fetch: async () => new Response('{}') } })('/api/projects'), /invalid-origin/);
  await assert.rejects(client('/api/desktop/login?next=https://evil.example', { method: 'POST' }), /api-route-not-allowed/);
  token = null;
  await client('/api/desktop/login', { method: 'POST', headers: { 'X-Ora-Desktop-Token': 'stale-token' }, body: '{}' });
  assert.equal(new Headers(calls[1].init.headers).has('X-Ora-Desktop-Token'), false);
});

test('drops a deferred request result when the active profile changes in flight', async () => {
  const gate = new ProfileSessionGate();
  const generation = gate.current();
  let activeOrigin = 'https://a.example';
  let release!: (value: { name: string }) => void;
  const pending = new Promise<{ name: string }>(resolve => { release = resolve; });
  const guarded = resolveForActiveProfile(pending, activeOrigin, () => activeOrigin, generation, gate);
  activeOrigin = 'https://b.example';
  gate.begin();
  release({ name: 'A branding' });
  assert.equal(await guarded, null);
});

test('rejects stale requests and connection completions after overlapping profile switches', async () => {
  const gate = new ProfileSessionGate();
  const originA = 'https://a.example';
  const originB = 'https://b.example';
  const staleA = gate.current();
  const staleB = gate.begin();
  gate.invalidate();
  const currentB = gate.begin();

  assert.equal(isCurrentProfileRequest(originA, originB, staleA, gate), false);
  assert.equal(isCurrentProfileRequest(originB, originB, staleB, gate), false);
  assert.equal(isCurrentProfileRequest(originB, originB, currentB, gate), true);
  assert.equal(isCurrentProfileRequest(originB, originA, currentB, gate), false);
});

test('discards only credentials explicitly rejected by the matching server', async () => {
  const accounts = new Map([['account-a', 'token-a'], ['account-b', 'token-b']]);
  const adapters = {
    accountForOrigin: async (origin: string) => origin === 'https://a.example' ? 'account-a' : 'account-b',
    credentials: {
      load: async (account: string) => accounts.get(account) ?? null,
      remove: async (account: string) => { accounts.delete(account); },
    },
    logout: async () => {},
  };

  assert.equal(await discardRejectedProfileToken('https://a.example', 503, adapters), false);
  assert.equal(accounts.get('account-a'), 'token-a');
  assert.equal(await discardRejectedProfileToken('https://a.example', 401, adapters), true);
  assert.equal(accounts.has('account-a'), false);
  assert.equal(accounts.get('account-b'), 'token-b');
  await assert.rejects(() => discardRejectedProfileToken('https://a.example/path', 401, adapters), /invalid-origin/);
});

test('restores and switches credentials only through each profile origin, even when old logout fails', async () => {
  const accounts = new Map([['account-a', 'token-a'], ['account-b', 'token-b']]);
  const calls: string[] = [];
  const adapters = {
    accountForOrigin: async (origin: string) => {
      calls.push(`account:${origin}`);
      return origin === 'https://a.example' ? 'account-a' : 'account-b';
    },
    credentials: {
      load: async (account: string) => { calls.push(`load:${account}`); return accounts.get(account) ?? null; },
      remove: async (account: string) => { calls.push(`remove:${account}`); accounts.delete(account); },
    },
    logout: async (origin: string, token: string) => {
      calls.push(`logout:${origin}:${token}`);
      throw new Error('offline');
    },
  };

  assert.equal(await restoreProfileToken('https://a.example', adapters), 'token-a');
  assert.equal(await switchProfileToken({ origin: 'https://a.example', token: 'token-a' }, 'https://b.example', adapters), 'token-b');
  assert.deepEqual(calls.slice(-3), [
    'logout:https://a.example:token-a',
    'account:https://b.example',
    'load:account-b',
  ]);
  await removeProfileToken('https://a.example', adapters);
  assert.equal(accounts.has('account-a'), false);
  assert.equal(accounts.get('account-b'), 'token-b');
});

test('ignores malformed and duplicate persisted profiles', () => {
  const storage = new MemoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify([
    { id: 'one', name: 'One', origin: 'https://one.example' },
    { id: 'dup', name: 'Duplicate', origin: 'https://ONE.example:443/' },
    { id: 'bad', name: 'Bad', origin: 'https://one.example/path' },
  ]));
  assert.deepEqual(readProfiles(storage), [{ id: 'one', name: 'One', origin: 'https://one.example' }]);
});
