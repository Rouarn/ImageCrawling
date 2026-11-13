import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { normalizeHeaders } from '../utils/headers.util';
import type { AdapterRuntime } from '../adapters/types';
import type { CrawlRequestDto } from '../dto/crawl-request.dto';

export const CRAWL_DEFAULTS = {
  maxPages: 10,
  concurrency: 5,
  pageDelayMs: 300,
  fetchTimeoutMs: 15_000,
} as const;

/** 分页模式单次最多生成的页数，避免误配置导致海量请求 */
export const MAX_PATTERN_PAGES = 200;

export interface ResolvedCrawlOptions {
  url: string;
  outDir: string;
  maxPages: number;
  concurrency: number;
  pageDelayMs: number;
  fetchTimeoutMs: number;
  pagePattern?: string;
  startPage: number;
  endPage?: number;
  useHeadless: boolean;
  headers: Record<string, string>;
  /** 命中的站点适配器运行时配置，未命中时由默认适配器接管 */
  adapter?: AdapterRuntime;
}

/**
 * 把 DTO 归一化为带默认值的配置，并做跨字段校验。
 */
export function resolveCrawlOptions(
  request: CrawlRequestDto,
): ResolvedCrawlOptions {
  const startPage = request.startPage ?? 1;
  const maxPages = request.maxPages ?? CRAWL_DEFAULTS.maxPages;

  let endPage = request.endPage;
  if (request.pagePattern) {
    endPage = endPage ?? startPage + maxPages - 1;
    if (endPage < startPage) {
      throw new AppException(
        ErrorCode.INVALID_PAGINATION,
        '结束页不能小于起始页',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (endPage - startPage + 1 > MAX_PATTERN_PAGES) {
      throw new AppException(
        ErrorCode.INVALID_PAGINATION,
        `单次最多抓取 ${MAX_PATTERN_PAGES} 页，请缩小页码范围`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  return {
    url: request.url,
    outDir: request.outDir?.trim() || 'images',
    maxPages,
    concurrency: request.concurrency ?? CRAWL_DEFAULTS.concurrency,
    pageDelayMs: request.pageDelayMs ?? CRAWL_DEFAULTS.pageDelayMs,
    fetchTimeoutMs: request.fetchTimeoutMs ?? CRAWL_DEFAULTS.fetchTimeoutMs,
    pagePattern: request.pagePattern,
    startPage,
    endPage,
    useHeadless: request.useHeadless ?? false,
    headers: normalizeHeaders(request.headers),
  };
}
