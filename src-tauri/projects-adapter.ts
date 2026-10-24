import type { ProjectApi } from '../src/components/projects-view';

export interface DesktopProjectRequester {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Bridges the shared Projects view's session lookup to the allowlisted desktop endpoint. */
export function createDesktopProjectsAdapter(client: DesktopProjectRequester): ProjectApi {
  return {
    request<T>(path: string, init?: RequestInit): Promise<T> {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'GET' && path === '/api/me') {
        return client.request<T>('/api/desktop/session', init);
      }
      if (method === 'GET' && path === '/api/users') {
        return Promise.resolve({ users: [] } as T);
      }
      return client.request<T>(path, init);
    },
  };
}
