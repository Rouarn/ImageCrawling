import { create } from 'zustand';
import { toApiError } from '@/api/client';
import { streamCrawl } from '@/api/crawl';
import type { CrawlEvent, CrawlLogLevel, CrawlRequest } from '@/api/contracts';
import { formatClockTime, formatDuration } from '@/lib/format';

export type TaskStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskLogEntry {
  id: number;
  time: string;
  level: CrawlLogLevel;
  message: string;
}

interface TaskState {
  status: TaskStatus;
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
  start: (request: CrawlRequest) => void;
  cancel: () => void;
  reset: () => void;
}

const MAX_LOGS = 300;

let controller: AbortController | null = null;
let logSequence = 0;

const IDLE_STATE = {
  status: 'idle' as TaskStatus,
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
          set({ outDir: event.outDir });
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
      logs: pushLog(state.logs, 'warn', '已取消当前任务'),
    }));
  },

  reset: () => {
    if (get().status === 'running') {
      controller?.abort();
    }
    set({ ...IDLE_STATE });
  },
}));

export function selectIsTaskRunning(state: TaskState): boolean {
  return state.status === 'running';
}
