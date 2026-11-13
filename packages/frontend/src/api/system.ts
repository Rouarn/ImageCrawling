import { api } from './client';
import type { SystemHealth } from './contracts';

export function fetchSystemHealth(): Promise<SystemHealth> {
  return api.get<SystemHealth>('/system/health');
}
