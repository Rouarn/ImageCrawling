import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { executablePath, launch, type Browser, type Page } from 'puppeteer';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { delay, errorMessage } from '../../common/utils/async.util';
import {
  formatChromeHelp,
  resolveChromeExecutable,
  type ChromeResolution,
} from '../../common/utils/chrome-path.util';
import { IMAGE_URL_PATTERN } from '../../common/utils/image-signature.util';
import { AppConfigService } from '../../config/app-config.service';
import type { ScrollStrategy } from '../adapters/types';
import { ChallengeDetectedError } from '../types/challenge';
import type { ResolvedCrawlOptions } from '../types/crawl-options';
import { parseCookieHeader } from '../utils/cookie.util';
import { buildBrowserHeaders, resolveUserAgent } from '../utils/headers.util';
import { ChallengeDetector } from './challenge-detector.service';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--disable-dev-shm-usage',
  '--ignore-certificate-errors',
];

/**
 * 复用单个 Puppeteer 浏览器实例，避免每页重复冷启动。
 */
@Injectable()
export class HeadlessBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(HeadlessBrowserService.name);
  /** 按代理地址缓存浏览器实例：无代理与各代理会话各复用一个 */
  private readonly browsers = new Map<string, Promise<Browser>>();
  private readonly chrome: ChromeResolution;

  constructor(
    config: AppConfigService,
    private readonly challengeDetector: ChallengeDetector,
  ) {
    this.chrome = resolveChromeExecutable({
      configuredPath: config.chromePath,
      puppeteerExecutablePath: readPuppeteerExecutablePath,
    });
    if (this.chrome.executablePath) {
      this.logger.log(
        `浏览器可执行文件：${this.chrome.executablePath}（来源：${this.chrome.source}）`,
      );
    } else {
      this.logger.warn(formatChromeHelp(this.chrome));
    }
  }

  isAvailable(): boolean {
    return Boolean(this.chrome.executablePath);
  }

  async extractImages(
    pageUrl: string,
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    sessionPage?: Page,
  ): Promise<string[]> {
    // 人工验证通过后沿用验证窗口的浏览器上下文：独立的无头实例会被重新挑战
    if (sessionPage && !sessionPage.isClosed()) {
      return this.extractFromPage(sessionPage, pageUrl, options, signal, false);
    }

    const browser = await this.getBrowser(options.adapter?.proxyUrl);
    const page = await browser.newPage();
    return this.extractFromPage(page, pageUrl, options, signal, true);
  }

  private async extractFromPage(
    page: Page,
    pageUrl: string,
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    closeAfter: boolean,
  ): Promise<string[]> {
    try {
      if (closeAfter) {
        await this.configurePage(page, options, pageUrl);
      }
      const intercepted = this.collectInterceptedImages(page);

      const response = await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: options.fetchTimeoutMs,
      });

      if (!response) {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          '无头模式未获得页面响应',
          HttpStatus.BAD_GATEWAY,
          { url: pageUrl },
        );
      }

      // 人机校验优先于普通 HTTP 错误：命中后交给抓取主干转人工验证
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        html: document.documentElement.outerHTML.slice(0, 8000),
      }));
      const detection = this.challengeDetector.detect({
        url: pageUrl,
        status: response.status(),
        title: pageInfo.title,
        html: pageInfo.html,
        rules: options.adapter?.challenge,
      });
      if (detection) throw new ChallengeDetectedError(detection);

      if (response.status() >= 400) {
        if (!options.adapter?.allowHttpErrors) {
          throw new AppException(
            ErrorCode.PAGE_FETCH_FAILED,
            `无头模式页面加载失败：HTTP ${response.status()}`,
            HttpStatus.BAD_GATEWAY,
            { url: pageUrl, status: response.status() },
          );
        }
        this.logger.warn(
          `页面返回 HTTP ${response.status()}，按适配器设置继续等待渲染`,
        );
      }

      await this.preparePage(page, options, pageUrl);
      this.throwIfAborted(signal);

      const domUrls = await page.evaluate((imageUrlPatternSource: string) => {
        const imageUrlPattern = new RegExp(imageUrlPatternSource, 'i');
        const result = new Set<string>();
        const toAbsolute = (value: string | null): string | null => {
          if (!value) return null;
          if (value.startsWith('data:') || value.startsWith('blob:')) {
            return value;
          }
          try {
            return new URL(value, location.href).href;
          } catch {
            return null;
          }
        };

        const pickFromSrcset = (srcset: string | null): string | null => {
          if (!srcset) return null;
          let bestUrl: string | null = null;
          let bestScore = -1;
          for (const part of srcset.split(',')) {
            const segments = part.trim().split(/\s+/);
            const url = segments[0];
            if (!url) continue;
            const spec = segments[1] || '';
            let score = 0;
            if (spec.endsWith('w')) score = Number.parseInt(spec, 10) || 0;
            else if (spec.endsWith('x'))
              score = (Number.parseFloat(spec) || 0) * 100;
            const absolute = toAbsolute(url);
            if (absolute && score >= bestScore) {
              bestUrl = absolute;
              bestScore = score;
            }
          }
          return bestUrl;
        };

        document.querySelectorAll('img').forEach((img) => {
          if (img.currentSrc) {
            const current = toAbsolute(img.currentSrc);
            if (current) result.add(current);
          }
          const attributes = [
            'src',
            'data-src',
            'data-original',
            'data-lazy',
            'data-url',
            'data-actualsrc',
            'data-href',
            'data-lazy-src',
            'data-source',
            'original-src',
            'data-pic-base64',
            'file',
            'zoomfile',
            'data-thumb',
            'data-full',
          ];
          for (const attribute of attributes) {
            const value = img.getAttribute(attribute);
            const absolute = value ? toAbsolute(value) : null;
            if (absolute) result.add(absolute);
          }
          const best = pickFromSrcset(
            img.getAttribute('srcset') || img.getAttribute('data-srcset'),
          );
          if (best) result.add(best);
        });

        document.querySelectorAll('*').forEach((element) => {
          const style = window.getComputedStyle(element);
          for (const value of [style.backgroundImage, style.content]) {
            if (!value || value === 'none') continue;
            const match = value.match(/url\((['"]?)([^)"']+)\1\)/i);
            if (match?.[2]) {
              const absolute = toAbsolute(match[2]);
              if (absolute) result.add(absolute);
            }
          }
          const dataBackground =
            element.getAttribute('data-bg') ||
            element.getAttribute('data-background');
          if (dataBackground) {
            const absolute = toAbsolute(dataBackground);
            if (absolute) result.add(absolute);
          }
        });

        document.querySelectorAll('video').forEach((video) => {
          const poster = video.getAttribute('poster');
          const absolute = poster ? toAbsolute(poster) : null;
          if (absolute) result.add(absolute);
        });

        document.querySelectorAll('source').forEach((source) => {
          const best = pickFromSrcset(
            source.getAttribute('srcset') || source.getAttribute('data-srcset'),
          );
          if (best) result.add(best);
          const src = source.getAttribute('src');
          const absolute = src ? toAbsolute(src) : null;
          if (absolute) result.add(absolute);
        });

        document.querySelectorAll('a').forEach((anchor) => {
          const href = anchor.getAttribute('href');
          if (href && imageUrlPattern.test(href)) {
            const absolute = toAbsolute(href);
            if (absolute) result.add(absolute);
          }
        });

        return Array.from(result).filter(
          (url) =>
            url.startsWith('http') ||
            url.startsWith('data:') ||
            url.startsWith('blob:'),
        );
      }, IMAGE_URL_PATTERN.source);

      const merged = new Set<string>([
        ...intercepted,
        ...domUrls.filter((url) => !url.startsWith('blob:')),
      ]);
      this.logger.log(
        `无头模式提取到 ${merged.size} 个地址（拦截 ${intercepted.size}，DOM ${domUrls.length}）`,
      );
      return [...merged];
    } catch (error) {
      // 挑战异常需要原样冒泡，供抓取主干转入人工验证，不能被包装成普通失败
      if (error instanceof ChallengeDetectedError) throw error;
      if (error instanceof AppException) throw error;
      if (isAbortSignalError(error, signal)) throw error;
      throw new AppException(
        ErrorCode.PAGE_FETCH_FAILED,
        `无头模式抓取失败：${errorMessage(error)}`,
        HttpStatus.BAD_GATEWAY,
        { url: pageUrl },
      );
    } finally {
      if (closeAfter) await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowsers();
  }

  private async configurePage(
    page: Page,
    options: ResolvedCrawlOptions,
    pageUrl: string,
  ): Promise<void> {
    const userAgent = resolveUserAgent(options.headers);
    if (userAgent) await page.setUserAgent(userAgent);

    // Cookie 统一走浏览器 Cookie 存储注入，避免与额外请求头重复下发同一个 Cookie
    const headerOptions = { ...options.headers };
    delete headerOptions.cookie;
    await page.setExtraHTTPHeaders({
      ...buildBrowserHeaders(headerOptions),
    });

    // 人工验证拿到的 Cookie 同时注入 document.cookie，供前端脚本校验
    const cookieHeader = options.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader, pageUrl);
      if (cookies.length > 0) {
        await page.setCookie(...cookies).catch(() => undefined);
      }
    }

    await page.setViewport({ width: 1600, height: 1000 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      const target = window as unknown as Record<string, unknown>;
      target.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
  }

  private collectInterceptedImages(page: Page): Set<string> {
    const intercepted = new Set<string>();
    page.on('response', (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.startsWith('image/') || IMAGE_URL_PATTERN.test(url)) {
        intercepted.add(url);
      }
    });
    return intercepted;
  }

  private async scrollToBottom(page: Page, waitMs: number): Promise<void> {
    await page.evaluate(
      async (pause: number) => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 120);
        });
        await new Promise((resolve) => setTimeout(resolve, pause));
      },
      Math.min(waitMs, 2000),
    );
  }

  /**
   * 页面加载后的准备动作：适配器声明的等待、点击（年龄门）与滚动策略。
   * 未命中适配器时保持原有的整页滚动行为。
   */
  private async preparePage(
    page: Page,
    options: ResolvedCrawlOptions,
    pageUrl: string,
  ): Promise<void> {
    const adapter = options.adapter;
    if (!adapter) {
      await this.scrollToBottom(page, options.pageDelayMs);
      return;
    }

    if (adapter.waitForSelector) {
      try {
        await page.waitForSelector(adapter.waitForSelector, {
          timeout: Math.min(options.fetchTimeoutMs, 20_000),
        });
      } catch {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          `页面未渲染出预期内容（等待 ${adapter.waitForSelector} 超时），可能被人机校验或登录态拦截`,
          HttpStatus.BAD_GATEWAY,
          { url: pageUrl },
        );
      }
    }

    for (const selector of adapter.clickSelectors) {
      if (await this.tryClick(page, selector)) {
        this.logger.log(`已点击页面元素：${selector}`);
      }
    }

    if (adapter.scroll) {
      await this.applyScroll(page, adapter.scroll);
    } else {
      await this.scrollToBottom(page, options.pageDelayMs);
    }
  }

  private async tryClick(page: Page, selector: string): Promise<boolean> {
    try {
      const handle = await page.$(selector);
      if (!handle) return false;
      await handle.click();
      await delay(300);
      return true;
    } catch {
      return false;
    }
  }

  /** 按适配器声明的滚动策略触发懒加载，支持整页或指定容器 */
  private async applyScroll(
    page: Page,
    strategy: ScrollStrategy,
  ): Promise<void> {
    if (strategy.mode === 'none') return;

    const rounds = strategy.maxRounds ?? 10;
    const stepPx = strategy.stepPx ?? 600;
    const intervalMs = strategy.intervalMs ?? 180;
    const mode = strategy.mode ?? 'page';
    const selector = strategy.selector ?? '';

    for (let round = 0; round < rounds; round += 1) {
      const reachedBottom = await page.evaluate(
        (params: { stepPx: number; mode: string; selector: string }) => {
          const container =
            params.mode === 'container' && params.selector
              ? document.querySelector(params.selector)
              : null;
          const target =
            container ?? document.scrollingElement ?? document.body;
          if (!target) return true;
          const before = target.scrollTop;
          target.scrollTop = before + params.stepPx;
          return (
            target.scrollTop + target.clientHeight >= target.scrollHeight - 2
          );
        },
        { stepPx, mode, selector },
      );
      await delay(intervalMs);
      if (reachedBottom) break;
    }

    await delay(strategy.settleMs ?? 1200);
  }

  private async getBrowser(proxyUrl?: string): Promise<Browser> {
    if (!this.chrome.executablePath) {
      throw new AppException(
        ErrorCode.HEADLESS_UNAVAILABLE,
        formatChromeHelp(this.chrome),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const key = proxyUrl ?? '';
    const cached = this.browsers.get(key);
    if (cached) {
      const browser = await cached.catch(() => undefined);
      if (browser?.connected) return browser;
      this.browsers.delete(key);
    }

    const args = proxyUrl
      ? [...LAUNCH_ARGS, `--proxy-server=${proxyUrl}`]
      : LAUNCH_ARGS;
    const launchPromise = launch({
      headless: true,
      args,
      executablePath: this.chrome.executablePath,
    })
      .then((browser) => {
        this.logger.log(
          proxyUrl
            ? `无头浏览器已启动（代理 ${proxyUrl}）`
            : '无头浏览器已启动',
        );
        return browser;
      })
      .catch((error: unknown) => {
        this.browsers.delete(key);
        throw new AppException(
          ErrorCode.HEADLESS_UNAVAILABLE,
          `无头浏览器启动失败：${errorMessage(error)}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      });

    this.browsers.set(key, launchPromise);
    return launchPromise;
  }

  private async closeBrowsers(): Promise<void> {
    const pending = [...this.browsers.values()];
    this.browsers.clear();
    await Promise.allSettled(
      pending.map(async (promise) => {
        const browser = await promise.catch(() => undefined);
        if (browser?.connected) await browser.close().catch(() => undefined);
      }),
    );
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('任务已取消', 'AbortError');
  }
}

function isAbortSignalError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}

/** Puppeteer 未下载自带浏览器时会抛错，这里统一降级为 undefined */
function readPuppeteerExecutablePath(): string | undefined {
  try {
    return executablePath();
  } catch {
    return undefined;
  }
}
