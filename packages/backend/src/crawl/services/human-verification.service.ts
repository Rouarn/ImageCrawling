import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { executablePath, launch, type Browser, type Page } from 'puppeteer';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { delay, errorMessage } from '../../common/utils/async.util';
import {
  formatChromeHelp,
  resolveChromeExecutable,
  type ChromeResolution,
} from '../../common/utils/chrome-path.util';
import { AppConfigService } from '../../config/app-config.service';
import type { CrawlEvent } from '../types/crawl-event';
import {
  VerificationError,
  type AdapterChallengeRules,
  type ChallengeDetection,
  type ChallengeState,
  type ChallengeVerification,
} from '../types/challenge';
import type { ResolvedCrawlOptions } from '../types/crawl-options';
import { serializeCookieHeader } from '../utils/cookie.util';
import { DEFAULT_USER_AGENT, resolveUserAgent } from '../utils/headers.util';
import { ChallengeDetector } from './challenge-detector.service';
import { VerificationSession } from './verification-session';

const DEFAULT_SUCCESS_COOKIES = ['cf_clearance'];
const POLL_INTERVAL_MS = 1000;
const WINDOW_GOTO_TIMEOUT_MS = 60_000;
const CONTENT_READY_TEXT_LENGTH = 500;

const WINDOW_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  // 初始窗口尺寸只影响窗口本身；配合 defaultViewport: null，页面内容跟随窗口实际大小
  '--window-size=1280,900',
];

interface PendingVerification {
  session: VerificationSession;
  url: string;
  options: ResolvedCrawlOptions;
  emit: (event: CrawlEvent) => void;
  window?: Browser;
  page?: Page;
  opening?: Promise<void>;
}

/** 验证通过后继续抓取时复用的浏览器上下文 */
interface VerifiedSession {
  browser: Browser;
  page: Page;
}

export interface RequestVerificationParams {
  taskId: string;
  detection: ChallengeDetection;
  url: string;
  options: ResolvedCrawlOptions;
  emit: (event: CrawlEvent) => void;
  signal: AbortSignal;
}

/**
 * 人工验证协调器。
 *
 * 抓取主干命中挑战后调用 request() 挂起等待；用户通过接口打开验证窗口，
 * 服务轮询窗口内的 Cookie / 内容判定是否通过，成功后返回会话凭据。
 */
@Injectable()
export class HumanVerificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HumanVerificationService.name);
  private readonly pending = new Map<string, PendingVerification>();
  private readonly sessions = new Map<string, VerifiedSession>();
  private readonly chrome: ChromeResolution;
  private activeWindowTaskId?: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly detector: ChallengeDetector,
  ) {
    this.chrome = resolveChromeExecutable({
      configuredPath: config.chromePath,
      puppeteerExecutablePath: readPuppeteerExecutablePath,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.cleanupExpiredProfile();
  }

  async onModuleDestroy(): Promise<void> {
    for (const pending of this.pending.values()) {
      pending.session.cancel('服务正在关闭');
      await this.closeWindow(pending);
    }
    this.pending.clear();
    for (const taskId of [...this.sessions.keys()]) {
      await this.release(taskId);
    }
  }

  isPending(taskId: string): boolean {
    return this.pending.has(taskId);
  }

  /**
   * 验证通过后用同一个浏览器上下文继续抓取页面。
   * 无头实例拿到的 cf_clearance 会被 Cloudflare 重新挑战，必须沿用验证窗口的会话。
   */
  getVerifiedPage(taskId: string): Page | undefined {
    const session = this.sessions.get(taskId);
    if (!session) return undefined;
    if (!session.browser.connected) {
      this.sessions.delete(taskId);
      if (this.activeWindowTaskId === taskId)
        this.activeWindowTaskId = undefined;
      return undefined;
    }
    return session.page;
  }

  /**
   * 用已验证的浏览器上下文拉取二进制内容（图片）。
   *
   * Cloudflare 的 cf_clearance 与浏览器指纹绑定，Node/undici 即使带上同样的
   * Cookie 与 UA 也会被判定为爬虫（403）。图片下载必须复用通过验证的会话。
   */
  async fetchImage(
    taskId: string,
    url: string,
  ): Promise<{ status: number; contentType: string; buffer: Buffer }> {
    const session = this.sessions.get(taskId);
    if (!session || !session.browser.connected) {
      throw new AppException(
        ErrorCode.CHALLENGE_FAILED,
        '验证会话已结束，无法通过浏览器下载图片',
        HttpStatus.CONFLICT,
      );
    }

    const result = await session.page.evaluate(async (target) => {
      const response = await fetch(target, { credentials: 'include' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + chunkSize),
        );
      }
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        base64: btoa(binary),
      };
    }, url);

    return {
      status: result.status,
      contentType: result.contentType,
      buffer: Buffer.from(result.base64, 'base64'),
    };
  }

  /** 任务结束时释放验证浏览器 */
  async release(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId);
    if (session) {
      this.sessions.delete(taskId);
      if (this.activeWindowTaskId === taskId)
        this.activeWindowTaskId = undefined;
      await session.browser.close().catch(() => undefined);
      return;
    }
    const pending = this.pending.get(taskId);
    if (pending) await this.closeWindow(pending);
  }

  /**
   * 请求人工验证：推 SSE 事件并挂起，直到通过 / 取消 / 超时 / 窗口关闭。
   */
  async request(
    params: RequestVerificationParams,
  ): Promise<ChallengeVerification> {
    if (this.pending.has(params.taskId)) {
      throw new AppException(
        ErrorCode.CHALLENGE_FAILED,
        '该任务已有等待中的人工验证',
        HttpStatus.CONFLICT,
      );
    }

    const pending: PendingVerification = {
      session: new VerificationSession({
        taskId: params.taskId,
        detection: params.detection,
        verifyUrl:
          params.options.adapter?.challenge?.verificationUrl ?? params.url,
        timeoutMs: this.config.verificationTimeoutMs,
        onStateChange: (state, payload) =>
          this.emitChallenge(pending, state, payload?.message),
      }),
      url: params.url,
      options: params.options,
      emit: params.emit,
    };

    this.pending.set(params.taskId, pending);
    this.emitChallenge(pending, 'pending');

    const onAbort = () => pending.session.cancel('任务已取消');
    params.signal.addEventListener('abort', onAbort);

    try {
      return await pending.session.promise;
    } catch (error) {
      throw toAppException(error);
    } finally {
      params.signal.removeEventListener('abort', onAbort);
      this.pending.delete(params.taskId);
      if (
        pending.session.state === 'resolved' &&
        pending.window?.connected &&
        pending.page
      ) {
        // 验证通过：保留这个已通过校验的浏览器上下文，供后续页面复用
        this.sessions.set(params.taskId, {
          browser: pending.window,
          page: pending.page,
        });
        pending.window = undefined;
        pending.page = undefined;
      } else {
        await this.closeWindow(pending);
      }
    }
  }

  /**
   * 打开本机可见的 Chrome 验证窗口，独立 profile，沿用任务代理。
   */
  async openWindow(taskId: string): Promise<'opened' | 'already-open'> {
    const pending = this.pending.get(taskId);
    if (!pending) {
      throw new AppException(
        ErrorCode.CHALLENGE_NOT_PENDING,
        '当前任务没有等待中的人工验证',
        HttpStatus.CONFLICT,
      );
    }
    if (pending.window) return 'already-open';
    if (pending.opening) {
      await pending.opening;
      return 'already-open';
    }
    if (this.activeWindowTaskId && this.activeWindowTaskId !== taskId) {
      throw new AppException(
        ErrorCode.CHALLENGE_NOT_PENDING,
        '另一个任务的验证浏览器仍在运行，请等待它结束或关闭该窗口',
        HttpStatus.CONFLICT,
      );
    }

    pending.opening = this.launchWindow(pending).catch((error: unknown) => {
      this.logger.warn(`验证窗口启动失败：${errorMessage(error)}`);
      // 保留等待状态，用户关闭占用 profile 的窗口后可以重试
      throw error instanceof AppException
        ? error
        : new AppException(
            ErrorCode.CHALLENGE_FAILED,
            `验证窗口启动失败：${errorMessage(error)}`,
            HttpStatus.BAD_GATEWAY,
          );
    });

    try {
      await pending.opening;
    } finally {
      pending.opening = undefined;
    }
    return 'opened';
  }

  /** 取消等待中的人工验证，窗口会在 request() 收尾时关闭 */
  cancel(taskId: string): boolean {
    const pending = this.pending.get(taskId);
    if (!pending) return false;
    return pending.session.cancel('人工验证已取消');
  }

  private async launchWindow(pending: PendingVerification): Promise<void> {
    if (!this.chrome.executablePath) {
      throw new AppException(
        ErrorCode.HEADLESS_UNAVAILABLE,
        formatChromeHelp(this.chrome),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const proxyUrl = pending.options.adapter?.proxyUrl;
    const args = proxyUrl
      ? [...WINDOW_ARGS, `--proxy-server=${proxyUrl}`]
      : WINDOW_ARGS;

    await fs.mkdir(this.config.verificationProfileDir, { recursive: true });

    const browser = await launch({
      headless: false,
      executablePath: this.chrome.executablePath,
      userDataDir: this.config.verificationProfileDir,
      args,
      // 不注入固定视口：页面跟随真实窗口大小，用户拉大窗口时布局立即铺满，无需刷新。
      // 无头实例仍保留固定视口（保证提取结果稳定），只改人工验证这一条路径。
      defaultViewport: null,
    });
    pending.window = browser;
    this.activeWindowTaskId = pending.session.taskId;

    browser.on('disconnected', () => {
      pending.window = undefined;
      if (this.activeWindowTaskId === pending.session.taskId) {
        this.activeWindowTaskId = undefined;
      }
      if (pending.session.state === 'pending') {
        pending.session.markWindowClosed();
      }
    });

    const page = await browser.newPage();
    pending.page = page;
    const userAgent =
      resolveUserAgent(pending.options.headers) ?? DEFAULT_USER_AGENT;
    await page.setUserAgent(userAgent);

    // 先返回给前端再导航：挑战页可能长时间不触发 domcontentloaded，不能阻塞“打开窗口”请求
    this.logger.log('人工验证窗口已打开');

    void this.pollWindow(
      pending,
      page,
      userAgent,
      pending.options.adapter?.challenge,
    ).catch((error: unknown) => {
      this.logger.warn(`验证窗口轮询异常：${errorMessage(error)}`);
      pending.session.fail('验证窗口异常结束');
    });

    void page
      .goto(pending.session.verifyUrl, {
        waitUntil: 'domcontentloaded',
        timeout: WINDOW_GOTO_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        // 挑战页可能一直不完成 load，交给轮询按 Cookie / 内容判定
        this.logger.warn(`验证窗口首次加载未完成：${errorMessage(error)}`);
      });
  }

  private async pollWindow(
    pending: PendingVerification,
    page: Page,
    userAgent: string,
    rules?: AdapterChallengeRules,
  ): Promise<void> {
    while (pending.session.state === 'pending') {
      if (!pending.window?.connected) return;
      const verification = await this.readVerification(
        page,
        userAgent,
        rules,
      ).catch(() => undefined);
      if (verification) {
        if (pending.session.resolve(verification)) {
          this.logger.log('人工验证通过，已取得会话凭据');
        }
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
  }

  private async readVerification(
    page: Page,
    userAgent: string,
    rules?: AdapterChallengeRules,
  ): Promise<ChallengeVerification | undefined> {
    const cookies = await page.cookies();
    const successCookies = rules?.successCookies?.length
      ? rules.successCookies
      : DEFAULT_SUCCESS_COOKIES;
    const cookieHeader = serializeCookieHeader(cookies);
    const hasSuccessCookie = successCookies.some((name) =>
      cookies.some((cookie) => cookie.name === name && cookie.value),
    );

    // 页面仍停留在挑战页时一律不判通过：cf_clearance 可能是上一次会话残留的失效值
    const info = await page.evaluate(() => ({
      title: document.title,
      textLength: document.body?.innerText?.trim().length ?? 0,
      html: document.documentElement.outerHTML.slice(0, 4000),
    }));
    const stillChallenge = this.detector.detect({
      url: page.url(),
      title: info.title,
      html: info.html,
      rules,
    });
    if (stillChallenge) return undefined;

    if (rules?.successSelector) {
      const element = await page.$(rules.successSelector);
      return element
        ? { cookie: cookieHeader, userAgent, finalUrl: page.url() }
        : undefined;
    }

    if (hasSuccessCookie && info.textLength > 0) {
      return { cookie: cookieHeader, userAgent, finalUrl: page.url() };
    }

    if (info.textLength < CONTENT_READY_TEXT_LENGTH) return undefined;

    return { cookie: cookieHeader, userAgent, finalUrl: page.url() };
  }

  private emitChallenge(
    pending: PendingVerification,
    state: ChallengeState,
    message?: string,
  ): void {
    const { session } = pending;
    pending.emit({
      type: 'challenge',
      taskId: session.taskId,
      state,
      url: pending.url,
      verifyUrl: session.verifyUrl,
      reason: session.detection.reason,
      status: session.detection.status,
      title: session.detection.title,
      matched: session.detection.matched,
      timeoutMs: session.timeoutMs,
      waitedMs: session.waitedMs,
      message,
    });
  }

  private async closeWindow(pending: PendingVerification): Promise<void> {
    const browser = pending.window;
    pending.window = undefined;
    pending.page = undefined;
    if (this.activeWindowTaskId === pending.session.taskId) {
      this.activeWindowTaskId = undefined;
    }
    if (browser?.connected) {
      await browser.close().catch(() => undefined);
    }
  }

  private async cleanupExpiredProfile(): Promise<void> {
    const profileDir = this.config.verificationProfileDir;
    try {
      const latest = await latestModified(profileDir);
      if (latest === undefined) return;
      if (Date.now() - latest <= this.config.verificationProfileTtlMs) return;
      await fs.rm(profileDir, { recursive: true, force: true });
      this.logger.log('已清理过期的人工验证 profile');
    } catch {
      // profile 不存在或不可读时忽略
    }
  }
}

function toAppException(error: unknown): unknown {
  if (!(error instanceof VerificationError)) return error;
  const status =
    error.reason === 'timeout'
      ? HttpStatus.GATEWAY_TIMEOUT
      : error.reason === 'cancelled'
        ? HttpStatus.REQUEST_TIMEOUT
        : HttpStatus.BAD_GATEWAY;
  const code =
    error.reason === 'timeout'
      ? ErrorCode.CHALLENGE_TIMEOUT
      : error.reason === 'cancelled'
        ? ErrorCode.CRAWL_ABORTED
        : ErrorCode.CHALLENGE_FAILED;
  return new AppException(code, error.message, status);
}

/** 取目录与 Cookie 文件中较新的修改时间 */
async function latestModified(target: string): Promise<number | undefined> {
  const candidates = [target, path.join(target, 'Default', 'Cookies')];
  let latest: number | undefined;
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      latest =
        latest === undefined ? stat.mtimeMs : Math.max(latest, stat.mtimeMs);
    } catch {
      continue;
    }
  }
  return latest;
}

function readPuppeteerExecutablePath(): string | undefined {
  try {
    return executablePath();
  } catch {
    return undefined;
  }
}
