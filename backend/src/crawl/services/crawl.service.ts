import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  delay,
  errorMessage,
  isAbortError,
  throwIfAborted,
} from '../../common/utils/async.util';
import { AppConfigService } from '../../config/app-config.service';
import { StorageService } from '../../storage/storage.service';
import { applyAdapterRuntime, createAdapterRuntime } from '../adapters/runtime';
import { AdapterRegistry } from '../adapters/registry';
import type { AdapterConfig } from '../adapters/types';
import type { CrawlRequestDto } from '../dto/crawl-request.dto';
import { CrawlEvent, CrawlSummary, FetchMode } from '../types/crawl-event';
import { resolveCrawlOptions } from '../types/crawl-options';
import { HeadlessBrowserService } from './headless-browser.service';
import { ImageDownloaderService } from './image-downloader.service';
import { ImageExtractorService } from './image-extractor.service';
import { PageFetcherService } from './page-fetcher.service';
import {
  PaginationPlannerService,
  type PagePlan,
} from './pagination-planner.service';

export type CrawlEventSink = (event: CrawlEvent) => void;

@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly adapters: AdapterRegistry,
    private readonly planner: PaginationPlannerService,
    private readonly pageFetcher: PageFetcherService,
    private readonly extractor: ImageExtractorService,
    private readonly headlessBrowser: HeadlessBrowserService,
    private readonly downloader: ImageDownloaderService,
  ) {}

  /**
   * 执行一次完整抓取：解析站点适配器 → 规划分页 → 提取图片 → 并发下载。
   */
  async run(
    request: CrawlRequestDto,
    emit: CrawlEventSink,
    signal: AbortSignal,
  ): Promise<CrawlSummary> {
    const resolved = resolveCrawlOptions(request);
    const outDirAbsolute = this.storage.resolveDirectory(resolved.outDir);
    const startedAt = Date.now();
    const requestId = randomUUID();

    emit({
      type: 'start',
      requestId,
      outDir: resolved.outDir,
      startedAt: new Date(startedAt).toISOString(),
    });
    emit({
      type: 'log',
      level: 'info',
      message: `开始抓取 ${resolved.url}，输出目录 storage/${resolved.outDir}`,
    });

    // 全链路唯一的适配器解析入口，未命中时由默认适配器接管，行为与通用抓取一致
    const adapter = this.adapters.resolveAdapter(resolved.url);
    const runtime = await createAdapterRuntime({
      adapter,
      url: resolved.url,
      timeoutMs: resolved.fetchTimeoutMs,
      config: this.adapterConfig,
      log: (level, message) => emit({ type: 'log', level, message }),
      signal,
    });
    const options = applyAdapterRuntime(resolved, runtime);

    if (runtime.id !== 'default') {
      emit({
        type: 'log',
        level: 'info',
        message: `已启用站点适配器：${runtime.label}（${runtime.id}）`,
      });
    }
    for (const note of runtime.notes) {
      emit({ type: 'log', level: 'info', message: note });
    }

    throwIfAborted(signal);
    const plan = await this.planner.plan(options, signal, (level, message) =>
      emit({ type: 'log', level, message }),
    );
    emit({
      type: 'plan',
      mode: plan.mode,
      pages: plan.pages.length,
      urls: plan.pages.map((page) => page.url),
    });

    const imageUrls = new Set<string>();
    for (const page of plan.pages) {
      throwIfAborted(signal);
      emit({
        type: 'page-start',
        index: page.index,
        total: plan.pages.length,
        url: page.url,
      });

      const pageStartedAt = Date.now();
      const result = await this.processPage(
        page.url,
        page.index,
        plan,
        options,
        signal,
        emit,
        imageUrls,
      );

      emit({
        type: 'page-done',
        index: page.index,
        total: plan.pages.length,
        url: page.url,
        found: result.found,
        added: result.added,
        mode: result.mode,
        durationMs: Date.now() - pageStartedAt,
      });

      await delay(options.pageDelayMs, signal);
    }

    const list = [...imageUrls];
    emit({ type: 'discover', count: list.length, pages: plan.pages.length });
    emit({ type: 'download-start', total: list.length });

    const { saved, failed } = await this.downloader.downloadAll(
      list,
      outDirAbsolute,
      options,
      signal,
      (progress) => emit({ type: 'download-progress', ...progress }),
    );

    const summary: CrawlSummary = {
      discovered: list.length,
      saved: saved.length,
      failed: failed.length,
      outDir: options.outDir,
      durationMs: Date.now() - startedAt,
    };
    emit({ type: 'complete', ...summary });
    this.logger.log(
      `抓取完成：发现 ${summary.discovered}，保存 ${summary.saved}，失败 ${summary.failed}`,
    );
    return summary;
  }

  private get adapterConfig(): AdapterConfig {
    return {
      get: (key) => this.config.getEnv(key),
      proxyUrl: this.config.proxyUrl,
    };
  }

  private async processPage(
    pageUrl: string,
    index: number,
    plan: PagePlan,
    options: ReturnType<typeof resolveCrawlOptions>,
    signal: AbortSignal,
    emit: CrawlEventSink,
    imageUrls: Set<string>,
  ): Promise<{ found: number; added: number; mode: FetchMode }> {
    if (!options.useHeadless) {
      try {
        const html =
          plan.htmlCache.get(pageUrl) ??
          (
            await this.pageFetcher.fetchHtml(pageUrl, {
              headers: options.headers,
              timeoutMs: options.fetchTimeoutMs,
              proxyUrl: options.adapter?.proxyUrl,
              signal,
            })
          ).html;
        const extracted = this.extractor.extract(html, pageUrl);
        return {
          found: extracted.length,
          added: this.mergeUrls(extracted, imageUrls),
          mode: 'static',
        };
      } catch (error) {
        if (isAbortError(error) && signal.aborted) throw error;
        const reason = errorMessage(error);
        emit({ type: 'page-fallback', index, url: pageUrl, reason });
      }
    }

    try {
      const extracted = await this.headlessBrowser.extractImages(
        pageUrl,
        options,
        signal,
      );
      return {
        found: extracted.length,
        added: this.mergeUrls(extracted, imageUrls),
        mode: 'headless',
      };
    } catch (error) {
      if (isAbortError(error) && signal.aborted) throw error;
      const message = errorMessage(error);
      this.logger.warn(`第 ${index} 页抓取失败: ${message}`);
      emit({ type: 'page-failed', index, url: pageUrl, message });
      return { found: 0, added: 0, mode: 'headless' };
    }
  }

  private mergeUrls(urls: string[], target: Set<string>): number {
    let added = 0;
    for (const url of urls) {
      if (target.has(url)) continue;
      target.add(url);
      added += 1;
    }
    return added;
  }
}
