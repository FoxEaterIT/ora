import { isCurrentProfileRequest, ProfileSessionGate } from './session-flow';

export type DesktopApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface DesktopApiTransport {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface DesktopApiClientOptions {
  origin: () => string;
  token: () => string | null;
  gate: ProfileSessionGate;
  transport: DesktopApiTransport;
  allowed(method: DesktopApiMethod, pathname: string, search: string): boolean;
}

/** Static-client transport boundary: the shell supplies credentials, allowlist, and fetch. */
export function createDesktopApiClient(options: DesktopApiClientOptions) {
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const origin = options.origin();
    if (!origin || !path.startsWith('/') || path.startsWith('//')) throw new Error('invalid-api-path');
    let normalized: string;
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
      normalized = parsed.origin;
    } catch {
      throw new Error('invalid-origin');
    }
    const target = new URL(path, normalized);
    if (target.origin !== normalized || !['http:', 'https:'].includes(target.protocol)) throw new Error('origin-mismatch');
    const method = (init.method || 'GET').toUpperCase() as DesktopApiMethod;
    if (!options.allowed(method, target.pathname, target.search)) throw new Error('api-route-not-allowed');

    const generation = options.gate.current();
    const isLogin = method === 'POST' && target.pathname === '/api/desktop/login' && target.search === '';
    if (method === 'POST' && target.pathname === '/api/desktop/login' && !isLogin) throw new Error('api-route-not-allowed');

    const token = options.token();
    if (!isLogin && !token) throw new Error('session-required');
    const headers = new Headers(init.headers);
    headers.delete('X-Ora-Desktop-Token');
    if (!isLogin && token) headers.set('X-Ora-Desktop-Token', token);
    const response = await options.transport.fetch(target.href, { ...init, method, headers, redirect: 'error' });
    if (!isCurrentProfileRequest(origin, options.origin(), generation, options.gate)) throw new Error('stale-profile-response');

    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) {
      const error = new Error(data?.error || 'request-failed') as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    if (!isCurrentProfileRequest(origin, options.origin(), generation, options.gate)) throw new Error('stale-profile-response');
    return data;
  };
}
