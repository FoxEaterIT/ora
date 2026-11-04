import type { TeamApi } from '../src/components/teams-view';

/** Bridges the shared Teams view's session lookup to the allowlisted desktop endpoint. */
export function createDesktopTeamsAdapter(client: TeamApi): TeamApi {
  return {
    request<T>(path: string, init?: RequestInit): Promise<T> {
      const method = (init?.method || 'GET').toUpperCase();

      // If the request is for users, we return an empty array as per the desktop-only scope
      if (method === 'GET' && path === '/api/users') {
        return Promise.resolve({ users: [] } as T);
      }

      // For all other requests, we use the client (which checks the allowlist)
      return client.request<T>(path, init);
    },
  };
}
