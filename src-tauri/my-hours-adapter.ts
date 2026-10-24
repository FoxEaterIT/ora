import type { MyHoursApi } from '../src/components/my-hours-view';

export interface DesktopMyHoursRequester {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Bridges shared My hours reads to the restricted desktop entry/project API. */
export function createDesktopMyHoursAdapter(client: DesktopMyHoursRequester): MyHoursApi {
  return {
    request<T>(path: string, init?: RequestInit): Promise<T> {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && (path === '/api/entries?mine=1' || path === '/api/projects')) return client.request<T>(path, init);
      throw new Error('desktop-my-hours-operation-not-supported');
    },
  };
}
