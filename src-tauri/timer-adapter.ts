import type { TimerApi } from '../src/components/timer-view';
export interface DesktopTimerRequester { request<T>(path: string, init?: RequestInit): Promise<T> }
/** Timer requests use the same guarded desktop API client as the rest of the shell. */
export function createDesktopTimerAdapter(client: DesktopTimerRequester): TimerApi {
  return { request: (path, init) => client.request(path, init) };
}
