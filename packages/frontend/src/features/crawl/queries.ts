import { useQuery } from '@tanstack/react-query';
import { fetchAdapters, fetchCrawlOptions } from '@/api/crawl';
import { fetchImageGroups } from '@/api/images';
import type { AdapterSummary, CrawlOptionsMeta } from '@/api/contracts';

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

export function useSiteAdapters(): AdapterSummary[] {
  const { data } = useQuery({
    queryKey: ['site-adapters'],
    queryFn: fetchAdapters,
    staleTime: Infinity,
    retry: 1,
  });
  return data ?? [];
}

/** 根目录组的文件直接放在 library 下，本身不是可用作 outDir 的子目录 */
const ROOT_GROUP_KEY = 'root';

/**
 * 已有分组作为输出目录候选，避免手输目录名拼错后图片散落到新目录。
 *
 * 查询键与图片库共用 `image-groups` 前缀：库内删除后失效会顺带刷新这里的候选。
 */
export function useOutDirOptions(): string[] {
  const { data } = useQuery({
    queryKey: ['image-groups', 'out-dir-options'],
    queryFn: fetchImageGroups,
    staleTime: 30_000,
    retry: 1,
  });
  return (data?.groups ?? [])
    .filter((group) => group.key !== ROOT_GROUP_KEY)
    .map((group) => group.key);
}
