import { useQuery } from '@tanstack/react-query';
import { fetchSystemHealth } from '@/api/system';

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}
