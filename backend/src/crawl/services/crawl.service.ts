import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
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
import {
  ChallengeDetectedError,
  type ChallengeDetection,
} from '../types/challenge';
import { CrawlEvent, CrawlSummary, FetchMode } from '../types/crawl-event';
import {
  resolveCrawlOptions,
  type ResolvedCrawlOptions,
} from '../types/crawl-options';
import { ChallengeDetector } from './challenge-detector.service';
import { HeadlessBrowserService } from './headless-browser.service';
import { HumanVerificationService } from './human-verification.service';
import { ImageDownloaderService } from './image-downloader.service';
import { ImageExtractorService } from './image-extractor.service';
import { PageFetcherService, type FetchedPage } from './page-fetcher.service';
import {
  PaginationPlannerService,
  type PagePlan,
} from './pagination-planner.service';

export type CrawlEventSink = (event: CrawlEvent) => void;

/** 单次抓取任务的运行态，人工验证后的 Cookie 会回写到 options */
interface CrawlRunSession {
  taskId: string;
  options: ResolvedCrawlOptions;
  verifications: number;
}

const MAX_VERIFICATIONS_PER_TASK = 3;

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
    private readonly challengeDetector: ChallengeDetector,
    private readonly verification: HumanVerificationService,
  ) {}

  /**
   * 执行一次完整抓取：解析站点适配器 → 规划分页 → 提取图片 → 并发下载。
   */
  async run(
    request: CrawlRequestDto,
    emit: CrawlEventSink,
    signal: AbortSignal,
  ): Promise<CrawlSummary> {
    const taskId = randomUUID();
    try {
      return await this.execute(taskId, request, emit, signal);
    } finally {
      // 任务结束（无论成败）都要释放人工验证占用的浏览器
      await this.verification.release(taskId);
    }
  }

  private async execute(
    taskId: string,
    request: CrawlRequestDto,
    emit: CrawlEventSink,
    signal: AbortSignal,
  ): Promise<CrawlSummary> {
    const resolved = resolveCrawlOptions(request);
    const outDirAbsolute = this.storage.resolveDirectory(resolved.outDir);
    const startedAt = Date.now();
    const requestId = taskId;

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
    const session: CrawlRunSession = {
      taskId: requestId,
      options: applyAdapterRuntime(resolved, runtime),
      verifications: 0,
    };

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
    const plan = await this.planWithVerification(session, signal, emit);
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
        session,
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

      await delay(session.options.pageDelayMs, signal);
    }

    const list = [...imageUrls];
    emit({ type: 'discover', count: list.length, pages: plan.pages.length });
    emit({ type: 'download-start', total: list.length });

    const { saved, failed } = await this.downloader.downloadAll(
      list,
      outDirAbsolute,
      session.options,
      signal,
      (progress) => emit({ type: 'download-progress', ...progress }),
    );

    const summary: CrawlSummary = {
      discovered: list.length,
      saved: saved.length,
      failed: failed.length,
      outDir: session.options.outDir,
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

  /** 规划阶段也可能撞上挑战页（自动翻页需要先取 HTML），命中后先验证再重新规划 */
  private async planWithVerification(
    session: CrawlRunSession,
    signal: AbortSignal,
    emit: CrawlEventSink,
  ): Promise<PagePlan> {
    try {
      return await this.planner.plan(
        session.options,
        signal,
        (level, message) => emit({ type: 'log', level, message }),
      );
    } catch (error) {
      if (isAbortError(error) && signal.aborted) throw error;
      const detection = this.detectFromError(
        error,
        session.options.url,
        session.options,
      );
      if (!detection) throw error;
      emit({
        type: 'log',
        level: 'warn',
        message: `规划分页时命中人机校验（${detection.reason}）`,
      });
      await this.verifyChallenge(
        session,
        detection,
        session.options.url,
        signal,
        emit,
      );
      return this.planner.plan(session.options, signal, (level, message) =>
        emit({ type: 'log', level, message }),
      );
    }
  }

  private async processPage(
    pageUrl: string,
    index: number,
    plan: PagePlan,
    session: CrawlRunSession,
    signal: AbortSignal,
    emit: CrawlEventSink,
    imageUrls: Set<string>,
  ): Promise<{ found: number; added: number; mode: FetchMode }> {
    if (!session.options.useHeadless) {
      try {
        const html = await this.loadStaticHtml(
          session,
          pageUrl,
          plan,
          signal,
          emit,
        );
        const extracted = this.extractor.extract(html, pageUrl);
        return {
          found: extracted.length,
          added: this.mergeUrls(extracted, imageUrls),
          mode: 'static',
        };
      } catch (error) {
        if (isAbortError(error) && signal.aborted) throw error;
        if (isChallengeError(error)) throw error;
        const reason = errorMessage(error);
        emit({ type: 'page-fallback', index, url: pageUrl, reason });
      }
    }

    try {
      const extracted = await this.loadHeadlessPage(
        pageUrl,
        index,
        session,
        signal,
        emit,
      );
      return {
        found: extracted.length,
        added: this.mergeUrls(extracted, imageUrls),
        mode: 'headless',
      };
    } catch (error) {
      if (isAbortError(error) && signal.aborted) throw error;
      if (isChallengeError(error)) throw error;
      const message = errorMessage(error);
      this.logger.warn(`第 ${index} 页抓取失败: ${message}`);
      emit({ type: 'page-failed', index, url: pageUrl, message });
      return { found: 0, added: 0, mode: 'headless' };
    }
  }

  /** 静态取页：命中挑战时挂起等待人工验证，通过后带上 Cookie 重取一次 */
  private async loadStaticHtml(
    session: CrawlRunSession,
    pageUrl: string,
    plan: PagePlan,
    signal: AbortSignal,
    emit: CrawlEventSink,
  ): Promise<string> {
    let fetched: FetchedPage;
    try {
      fetched = await this.fetchStatic(session, pageUrl, plan, signal);
    } catch (error) {
      const detection = this.detectFromError(error, pageUrl, session.options);
      if (!detection) throw error;
      fetched = await this.verifyAndRefetch(
        session,
        detection,
        pageUrl,
        plan,
        signal,
        emit,
      );
    }

    const detection = this.detectPage(
      fetched.html,
      fetched.status,
      pageUrl,
      session.options,
    );
    if (!detection) return fetched.html;

    emit({
      type: 'log',
      level: 'warn',
      message: `页面命中人机校验（${detection.matched.join(', ')}）`,
    });
    const retried = await this.verifyAndRefetch(
      session,
      detection,
      pageUrl,
      plan,
      signal,
      emit,
    );
    if (
      this.detectPage(retried.html, retried.status, pageUrl, session.options)
    ) {
      throw new AppException(
        ErrorCode.CHALLENGE_FAILED,
        '人工验证后页面仍停留在人机校验',
        502,
        { url: pageUrl },
      );
    }
    return retried.html;
  }

  /** 无头取页：命中挑战时挂起等待人工验证，通过后带 Cookie 再渲染一次 */
  private async loadHeadlessPage(
    pageUrl: string,
    index: number,
    session: CrawlRunSession,
    signal: AbortSignal,
    emit: CrawlEventSink,
  ): Promise<string[]> {
    try {
      return await this.headlessBrowser.extractImages(
        pageUrl,
        session.options,
        signal,
        this.verification.getVerifiedPage(session.taskId),
      );
    } catch (error) {
      if (!(error instanceof ChallengeDetectedError)) throw error;
      emit({
        type: 'log',
        level: 'warn',
        message: `第 ${index} 页命中人机校验（${error.detection.matched.join(', ')}）`,
      });
      await this.verifyChallenge(
        session,
        error.detection,
        pageUrl,
        signal,
        emit,
      );
      try {
        return await this.headlessBrowser.extractImages(
          pageUrl,
          session.options,
          signal,
          this.verification.getVerifiedPage(session.taskId),
        );
      } catch (retryError) {
        if (retryError instanceof ChallengeDetectedError) {
          throw new AppException(
            ErrorCode.CHALLENGE_FAILED,
            '人工验证后页面仍停留在人机校验',
            502,
            { url: pageUrl },
          );
        }
        throw retryError;
      }
    }
  }

  private async fetchStatic(
    session: CrawlRunSession,
    pageUrl: string,
    plan: PagePlan,
    signal: AbortSignal,
  ): Promise<FetchedPage> {
    const cached = plan.htmlCache.get(pageUrl);
    if (cached !== undefined) {
      return { url: pageUrl, status: 200, html: cached };
    }
    const fetched = await this.pageFetcher.fetchHtml(pageUrl, {
      headers: session.options.headers,
      timeoutMs: session.options.fetchTimeoutMs,
      proxyUrl: session.options.adapter?.proxyUrl,
      signal,
    });
    plan.htmlCache.set(pageUrl, fetched.html);
    return fetched;
  }

  private async verifyAndRefetch(
    session: CrawlRunSession,
    detection: ChallengeDetection,
    pageUrl: string,
    plan: PagePlan | undefined,
    signal: AbortSignal,
    emit: CrawlEventSink,
  ): Promise<FetchedPage> {
    await this.verifyChallenge(session, detection, pageUrl, signal, emit);
    plan?.htmlCache.delete(pageUrl);
    const fetched = await this.pageFetcher.fetchHtml(pageUrl, {
      headers: session.options.headers,
      timeoutMs: session.options.fetchTimeoutMs,
      proxyUrl: session.options.adapter?.proxyUrl,
      signal,
    });
    plan?.htmlCache.set(pageUrl, fetched.html);
    return fetched;
  }

  /**
   * 转入人工验证并等待结果，成功后把 Cookie 回写到任务运行态。
   * 超时 / 取消 / 窗口关闭都会抛出带明确错误码的异常。
   */
  private async verifyChallenge(
    session: CrawlRunSession,
    detection: ChallengeDetection,
    pageUrl: string,
    signal: AbortSignal,
    emit: CrawlEventSink,
  ): Promise<void> {
    if (session.verifications >= MAX_VERIFICATIONS_PER_TASK) {
      throw new AppException(
        ErrorCode.CHALLENGE_FAILED,
        `本任务的人工验证次数已达上限（${MAX_VERIFICATIONS_PER_TASK} 次）`,
        HttpStatus.BAD_GATEWAY,
        { url: pageUrl },
      );
    }
    session.verifications += 1;

    const verification = await this.verification.request({
      taskId: session.taskId,
      detection,
      url: pageUrl,
      options: session.options,
      emit,
      signal,
    });

    session.options = {
      ...session.options,
      headers: { ...session.options.headers, cookie: verification.cookie },
    };
    emit({
      type: 'log',
      level: 'info',
      message: `人工验证通过（最终地址 ${verification.finalUrl ?? pageUrl}），已沿用验证会话继续抓取`,
    });
  }

  private detectPage(
    html: string,
    status: number | undefined,
    pageUrl: string,
    options: ResolvedCrawlOptions,
  ): ChallengeDetection | undefined {
    return this.challengeDetector.detect({
      url: pageUrl,
      status,
      title: extractTitle(html),
      html,
      rules: options.adapter?.challenge,
    });
  }

  private detectFromError(
    error: unknown,
    pageUrl: string,
    options: ResolvedCrawlOptions,
  ): ChallengeDetection | undefined {
    if (!(error instanceof AppException)) return undefined;
    const details = error.details as { status?: number } | undefined;
    const status = details?.status;
    if (status !== 403 && status !== 429) return undefined;
    return this.challengeDetector.detect({
      url: pageUrl,
      status,
      rules: options.adapter?.challenge,
    });
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

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1]?.trim() || undefined;
}

function isChallengeError(error: unknown): boolean {
  if (error instanceof ChallengeDetectedError) return true;
  if (!(error instanceof AppException)) return false;
  return (
    error.code === ErrorCode.CHALLENGE_FAILED ||
    error.code === ErrorCode.CHALLENGE_TIMEOUT ||
    error.code === ErrorCode.CHALLENGE_NOT_PENDING ||
    error.code === ErrorCode.CRAWL_ABORTED
  );
}
