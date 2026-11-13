import { create } from 'zustand';
import { toApiError } from '@/api/client';
import {
  cancelVerificationWindow,
  openVerificationWindow,
  streamCrawl,
} from '@/api/crawl';
import type {
  ChallengeReason,
  ChallengeState,
  CrawlEvent,
  CrawlLogLevel,
  CrawlRequest,
} from '@/api/contracts';
import { formatClockTime, formatDuration } from '@/lib/format';

export type TaskStatus =
  | 'idle'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** 进行中的任务（含等待人工验证） */
export function isTaskActive(status: TaskStatus): boolean {
  return status === 'running' || status === 'verifying';
}

export interface ChallengeInfo {
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
  /** 前端收到事件的时间，用于计算已等待时长 */
  receivedAt: number;
}

export interface TaskLogEntry {
  id: number;
  time: string;
  level: CrawlLogLevel;
  message: string;
}

interface TaskState {
  status: TaskStatus;
  taskId: string | null;
  request: CrawlRequest | null;
  outDir: string | null;
  logs: TaskLogEntry[];
  planPages: number;
  completedPages: number;
  currentPage: string | null;
  discovered: number;
  downloadTotal: number;
  downloadDone: number;
  saved: number;
  failed: number;
  durationMs: number | null;
  error: { code: string; message: string } | null;
  headless: boolean;
  challenge: ChallengeInfo | null;
  verificationOpened: boolean;
  verificationBusy: boolean;
  start: (request: CrawlRequest) => void;
  cancel: () => void;
  openVerification: () => Promise<void>;
  cancelVerification: () => Promise<void>;
  reset: () => void;
}

const MAX_LOGS = 300;

let controller: AbortController | null = null;
let logSequence = 0;

const IDLE_STATE = {
  status: 'idle' as TaskStatus,
  taskId: null,
  request: null,
  outDir: null,
  logs: [] as TaskLogEntry[],
  planPages: 0,
  completedPages: 0,
  currentPage: null,
  discovered: 0,
  downloadTotal: 0,
  downloadDone: 0,
  saved: 0,
  failed: 0,
  durationMs: null,
  error: null,
  headless: false,
  challenge: null,
  verificationOpened: false,
  verificationBusy: false,
};

function createLog(level: CrawlLogLevel, message: string): TaskLogEntry {
  logSequence += 1;
  return { id: logSequence, time: formatClockTime(), level, message };
}

function pushLog(
  logs: TaskLogEntry[],
  level: CrawlLogLevel,
  message: string,
): TaskLogEntry[] {
  const next = [...logs, createLog(level, message)];
  return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
}

export const useCrawlTaskStore = create<TaskState>((set, get) => ({
  ...IDLE_STATE,

  start: (request) => {
    controller?.abort();
    const current = new AbortController();
    controller = current;

    set({
      ...IDLE_STATE,
      status: 'running',
      request,
      outDir: request.outDir ?? null,
      headless: Boolean(request.useHeadless),
      logs: [createLog('info', `任务已创建，目标 ${request.url}`)],
    });

    const handleEvent = (event: CrawlEvent) => {
      if (current.signal.aborted) return;
      const state = get();

      switch (event.type) {
        case 'start':
          set({ outDir: event.outDir, taskId: event.requestId });
          break;
        case 'log':
          set({ logs: pushLog(state.logs, event.level, event.message) });
          break;
        case 'plan':
          set({
            planPages: event.pages,
            logs: pushLog(
              state.logs,
              'info',
              `分页规划完成：共 ${event.pages} 页（${
                event.mode === 'auto' ? '自动翻页' : '分页模板'
              }）`,
            ),
          });
          break;
        case 'page-start':
          set({
            currentPage: `第 ${event.index}/${event.total} 页`,
            logs: pushLog(
              state.logs,
              'info',
              `抓取第 ${event.index}/${event.total} 页：${event.url}`,
            ),
          });
          break;
        case 'page-done':
          set({
            completedPages: event.index,
            currentPage: null,
            logs: pushLog(
              state.logs,
              'info',
              `第 ${event.index}/${event.total} 页完成，新增 ${event.added} 张（${
                event.mode === 'headless' ? '无头渲染' : '静态解析'
              }）`,
            ),
          });
          break;
        case 'page-fallback':
          set({
            logs: pushLog(
              state.logs,
              'warn',
              `第 ${event.index} 页静态抓取失败，切换无头模式：${event.reason}`,
            ),
          });
          break;
        case 'page-failed':
          set({
            logs: pushLog(
              state.logs,
              'error',
              `第 ${event.index} 页抓取失败：${event.message}`,
            ),
          });
          break;
        case 'challenge': {
          const info: ChallengeInfo = {
            taskId: event.taskId,
            state: event.state,
            url: event.url,
            verifyUrl: event.verifyUrl,
            reason: event.reason,
            status: event.status,
            title: event.title,
            matched: event.matched,
            timeoutMs: event.timeoutMs,
            waitedMs: event.waitedMs,
            message: event.message,
            receivedAt: Date.now(),
          };

          if (event.state === 'pending') {
            set({
              status: 'verifying',
              challenge: info,
              verificationOpened: false,
              currentPage: null,
              logs: pushLog(
                state.logs,
                'warn',
                `命中人机校验（${event.matched.join(', ')}），任务已挂起等待人工验证`,
              ),
            });
          } else if (event.state === 'resolved') {
            set({
              status: 'running',
              challenge: null,
              verificationOpened: false,
              logs: pushLog(
                state.logs,
                'info',
                '人工验证已通过，继续抓取',
              ),
            });
          } else {
            const cancelled = event.state === 'cancelled';
            const message = event.message ?? '人工验证未完成';
            set({
              status: cancelled ? 'cancelled' : 'failed',
              challenge: info,
              currentPage: null,
              error: cancelled
                ? { code: 'CRAWL_ABORTED', message }
                : {
                    code:
                      event.state === 'timeout'
                        ? 'CHALLENGE_TIMEOUT'
                        : 'CHALLENGE_FAILED',
                    message,
                  },
              logs: pushLog(state.logs, cancelled ? 'warn' : 'error', message),
            });
          }
          break;
        }
        case 'discover':
          set({
            discovered: event.count,
            logs: pushLog(state.logs, 'info', `共发现 ${event.count} 张图片`),
          });
          break;
        case 'download-start':
          set({
            downloadTotal: event.total,
            logs: pushLog(state.logs, 'info', `开始下载 ${event.total} 张图片`),
          });
          break;
        case 'download-progress':
          set({
            downloadDone: event.done,
            downloadTotal: event.total,
            saved: event.saved,
            failed: event.failed,
          });
          break;
        case 'complete':
          set({
            status: 'completed',
            saved: event.saved,
            failed: event.failed,
            discovered: event.discovered,
            durationMs: event.durationMs,
            currentPage: null,
            logs: pushLog(
              state.logs,
              'info',
              `任务完成：保存 ${event.saved} 张，失败 ${event.failed} 张，用时 ${formatDuration(
                event.durationMs,
              )}`,
            ),
          });
          break;
        case 'error':
          set({
            status:
              event.error.code === 'CRAWL_ABORTED' ? 'cancelled' : 'failed',
            error: event.error,
            currentPage: null,
            logs: pushLog(
              state.logs,
              'error',
              `${event.error.message}（${event.error.code}）`,
            ),
          });
          break;
      }
    };

    void (async () => {
      try {
        await streamCrawl(request, handleEvent, current.signal);
        if (current.signal.aborted) {
          set({ status: 'cancelled', currentPage: null });
        } else if (get().status === 'running') {
          set({ status: 'completed', currentPage: null });
        } else if (get().status === 'verifying') {
          set({
            status: 'failed',
            currentPage: null,
            error: {
              code: 'CHALLENGE_FAILED',
              message: '连接在等待人工验证时中断',
            },
          });
        }
      } catch (error) {
        if (current.signal.aborted) {
          set({ status: 'cancelled', currentPage: null });
        } else {
          const apiError = toApiError(error);
          set((state) => ({
            status: 'failed',
            currentPage: null,
            error: { code: apiError.code, message: apiError.message },
            logs: pushLog(
              state.logs,
              'error',
              `${apiError.message}（${apiError.code}）`,
            ),
          }));
        }
      } finally {
        if (controller === current) controller = null;
      }
    })();
  },

  cancel: () => {
    if (!controller) return;
    controller.abort();
    set((state) => ({
      status: 'cancelled',
      currentPage: null,
      challenge: null,
      logs: pushLog(state.logs, 'warn', '已取消当前任务'),
    }));
  },

  openVerification: async () => {
    const { taskId, status } = get();
    if (!taskId || status !== 'verifying') return;
    set({ verificationBusy: true });
    try {
      const result = await openVerificationWindow(taskId);
      set((state) => ({
        verificationOpened: true,
        logs: pushLog(
          state.logs,
          'info',
          result === 'already-open'
            ? '验证窗口已在运行'
            : '已打开验证窗口，请在弹出的浏览器中完成校验',
        ),
      }));
    } catch (error) {
      const apiError = toApiError(error);
      set((state) => ({
        logs: pushLog(
          state.logs,
          'error',
          `打开验证窗口失败：${apiError.message}`,
        ),
      }));
    } finally {
      set({ verificationBusy: false });
    }
  },

  cancelVerification: async () => {
    const { taskId } = get();
    if (!taskId) return;
    try {
      await cancelVerificationWindow(taskId);
    } catch (error) {
      const apiError = toApiError(error);
      set((state) => ({
        logs: pushLog(
          state.logs,
          'error',
          `取消人工验证失败：${apiError.message}`,
        ),
      }));
    }
  },

  reset: () => {
    if (isTaskActive(get().status)) {
      controller?.abort();
    }
    set({ ...IDLE_STATE });
  },
}));

export function selectIsTaskRunning(state: TaskState): boolean {
  return isTaskActive(state.status);
}
