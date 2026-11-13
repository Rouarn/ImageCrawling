import { useQuery } from '@tanstack/react-query';
import { fetchCrawlOptions } from '@/api/crawl';
import type { CrawlOptionsMeta } from '@/api/contracts';

export const FALLBACK_CRAWL_OPTIONS: CrawlOptionsMeta = {
  defaults: {
    maxPages: 10,
    concurrency: 5,
    pageDelayMs: 300,
    fetchTimeoutMs: 15_000,
  },
  limits: {
    maxPages: 50,
    concurrency: 10,
    pageDelayMs: 5000,
    fetchTimeoutMs: 60_000,
  },
};

export function useCrawlOptions(): CrawlOptionsMeta {
  const { data } = useQuery({
    queryKey: ['crawl-options'],
    queryFn: fetchCrawlOptions,
    staleTime: Infinity,
    retry: 1,
  });
  return data ?? FALLBACK_CRAWL_OPTIONS;
}
