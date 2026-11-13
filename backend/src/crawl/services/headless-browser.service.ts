import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import * as fs from 'node:fs';
import { executablePath, launch, type Browser, type Page } from 'puppeteer';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { errorMessage } from '../../common/utils/async.util';
import { AppConfigService } from '../../config/app-config.service';
import type { ResolvedCrawlOptions } from '../types/crawl-options';
import { buildBrowserHeaders, resolveUserAgent } from '../utils/headers.util';

const IMAGE_URL_PATTERN =
  /\.(jpg|jpeg|png|gif|webp|svg|avif|heic|ico|bmp|tiff)(\?.*)?$/i;

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
  private browser?: Browser;
  private launchPromise?: Promise<Browser>;
  private readonly chromePath?: string;

  constructor(config: AppConfigService) {
    this.chromePath = config.chromePath;
  }

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.chromePath ?? executablePath());
    } catch {
      return false;
    }
  }

  async extractImages(
    pageUrl: string,
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
  ): Promise<string[]> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await this.configurePage(page, options);
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
      if (response.status() >= 400) {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          `无头模式页面加载失败：HTTP ${response.status()}`,
          HttpStatus.BAD_GATEWAY,
          { url: pageUrl, status: response.status() },
        );
      }

      await this.scrollToBottom(page, options.pageDelayMs);
      this.throwIfAborted(signal);

      const domUrls = await page.evaluate(() => {
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
          if (
            href &&
            /\.(jpg|jpeg|png|gif|webp|svg|avif|heic|ico|bmp|tiff)(\?.*)?$/i.test(
              href,
            )
          ) {
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
      });

      const merged = new Set<string>([
        ...intercepted,
        ...domUrls.filter((url) => !url.startsWith('blob:')),
      ]);
      this.logger.log(
        `无头模式提取到 ${merged.size} 个地址（拦截 ${intercepted.size}，DOM ${domUrls.length}）`,
      );
      return [...merged];
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (isAbortSignalError(error, signal)) throw error;
      throw new AppException(
        ErrorCode.PAGE_FETCH_FAILED,
        `无头模式抓取失败：${errorMessage(error)}`,
        HttpStatus.BAD_GATEWAY,
        { url: pageUrl },
      );
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }

  private async configurePage(
    page: Page,
    options: ResolvedCrawlOptions,
  ): Promise<void> {
    const userAgent = resolveUserAgent(options.headers);
    if (userAgent) await page.setUserAgent(userAgent);

    await page.setExtraHTTPHeaders({
      ...buildBrowserHeaders(options.headers),
    });
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

  private getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return Promise.resolve(this.browser);
    if (!this.launchPromise) {
      this.launchPromise = launch({
        headless: true,
        args: LAUNCH_ARGS,
        ...(this.chromePath ? { executablePath: this.chromePath } : {}),
      })
        .then((browser) => {
          this.browser = browser;
          this.logger.log('无头浏览器已启动');
          return browser;
        })
        .catch((error: unknown) => {
          this.launchPromise = undefined;
          throw new AppException(
            ErrorCode.HEADLESS_UNAVAILABLE,
            `无头浏览器启动失败：${errorMessage(error)}`,
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        });
    }
    return this.launchPromise;
  }

  private async closeBrowser(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    this.launchPromise = undefined;
    if (browser?.connected) await browser.close().catch(() => undefined);
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
