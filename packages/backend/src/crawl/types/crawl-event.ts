import type { ErrorCode } from '../../common/errors/error-code';
import type { ChallengeReason, ChallengeState } from './challenge';

export type CrawlLogLevel = 'info' | 'warn' | 'error';

export type CrawlMode = 'auto' | 'pattern';
export type FetchMode = 'static' | 'headless';

/**
 * 通过 SSE 推送给前端的事件。type 即事件类型，前端据此渲染日志与进度。
 */
export type CrawlEvent =
  | {
      type: 'start';
      requestId: string;
      outDir: string;
      startedAt: string;
    }
  | { type: 'log'; level: CrawlLogLevel; message: string }
  | {
      type: 'plan';
      mode: CrawlMode;
      pages: number;
      urls: string[];
    }
  | { type: 'page-start'; index: number; total: number; url: string }
  | {
      type: 'page-done';
      index: number;
      total: number;
      url: string;
      found: number;
      added: number;
      mode: FetchMode;
      durationMs: number;
    }
  | { type: 'page-fallback'; index: number; url: string; reason: string }
  | { type: 'page-failed'; index: number; url: string; message: string }
  | {
      /** 人机校验：任务挂起，等待用户在弹出的浏览器中完成验证 */
      type: 'challenge';
      taskId: string;
      state: ChallengeState;
      url: string;
      verifyUrl: string;
      reason: ChallengeReason;
      status?: number;
      title?: string;
      matched: string[];
      timeoutMs: number;
      waitedMs: number;
      message?: string;
    }
  | { type: 'discover'; count: number; pages: number }
  | { type: 'download-start'; total: number }
  | {
      type: 'download-progress';
      done: number;
      total: number;
      saved: number;
      failed: number;
      file?: string;
    }
  | {
      type: 'complete';
      discovered: number;
      saved: number;
      failed: number;
      outDir: string;
      durationMs: number;
    }
  | {
      type: 'error';
      error: { code: ErrorCode; message: string; details?: unknown };
    };

export interface SavedImage {
  url: string;
  file: string;
  path: string;
}

export interface FailedImage {
  url: string;
  reason: string;
}

export interface DownloadProgress {
  done: number;
  total: number;
  saved: number;
  failed: number;
  file?: string;
}

export interface CrawlSummary {
  discovered: number;
  saved: number;
  failed: number;
  outDir: string;
  durationMs: number;
}
