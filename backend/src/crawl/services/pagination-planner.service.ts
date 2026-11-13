import { Injectable, Logger } from '@nestjs/common';
import { delay, errorMessage } from '../../common/utils/async.util';
import { ImageExtractorService } from './image-extractor.service';
import { PageFetcherService } from './page-fetcher.service';
import type { ResolvedCrawlOptions } from '../types/crawl-options';
import type { CrawlLogLevel, CrawlMode } from '../types/crawl-event';

export interface PageTarget {
  index: number;
  url: string;
}

export interface PagePlan {
  mode: CrawlMode;
  pages: PageTarget[];
  /** 探测分页时已抓取的 HTML，供后续解析直接复用，避免重复请求 */
  htmlCache: Map<string, string>;
}

export type PlanLogger = (level: CrawlLogLevel, message: string) => void;

@Injectable()
export class PaginationPlannerService {
  private readonly logger = new Logger(PaginationPlannerService.name);

  constructor(
    private readonly pageFetcher: PageFetcherService,
    private readonly extractor: ImageExtractorService,
  ) {}

  async plan(
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    log: PlanLogger,
  ): Promise<PagePlan> {
    if (options.pagePattern) {
      return this.planFromPattern(options, log);
    }
    return this.planFromNextLinks(options, signal, log);
  }

  private planFromPattern(
    options: ResolvedCrawlOptions,
    log: PlanLogger,
  ): PagePlan {
    const pattern = options.pagePattern;
    if (!pattern) {
      throw new Error('planFromPattern 需要 pagePattern 参数');
    }
    const start = options.startPage;
    const end = options.endPage ?? start + options.maxPages - 1;
    const pages: PageTarget[] = [];
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.push({
        index: pages.length + 1,
        url: pattern.replace('{page}', encodeURIComponent(String(pageNumber))),
      });
    }
    log(
      'info',
      `分页模式：第 ${start} 页 ~ 第 ${end} 页，共 ${pages.length} 页`,
    );
    return { mode: 'pattern', pages, htmlCache: new Map() };
  }

  private async planFromNextLinks(
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    log: PlanLogger,
  ): Promise<PagePlan> {
    const origin = new URL(options.url).origin;
    const pages: PageTarget[] = [];
    const htmlCache = new Map<string, string>();
    const visited = new Set<string>();
    let current = options.url;

    for (let i = 0; i < options.maxPages; i += 1) {
      pages.push({ index: i + 1, url: current });
      visited.add(current);

      if (i === options.maxPages - 1) break;

      let html = htmlCache.get(current);
      if (html === undefined) {
        try {
          const fetched = await this.pageFetcher.fetchHtml(current, {
            headers: options.headers,
            timeoutMs: options.fetchTimeoutMs,
            signal,
          });
          html = fetched.html;
          htmlCache.set(current, html);
        } catch (error) {
          if (pages.length === 1) throw error;
          this.logger.warn(
            `探测下一页失败，已保留前 ${pages.length} 页: ${errorMessage(error)}`,
          );
          log(
            'warn',
            `探测下一页失败，继续处理已发现页面：${errorMessage(error)}`,
          );
          break;
        }
      }

      const next = this.extractor.findNextPageUrl(html, current);
      if (!next) break;

      let nextOrigin: string;
      try {
        nextOrigin = new URL(next).origin;
      } catch {
        break;
      }
      if (nextOrigin !== origin) {
        log('info', '下一页指向其他站点，停止自动翻页');
        break;
      }
      if (visited.has(next)) break;

      current = next;
      await delay(options.pageDelayMs, signal);
    }

    log('info', `自动翻页：共发现 ${pages.length} 页`);
    return { mode: 'auto', pages, htmlCache };
  }
}
