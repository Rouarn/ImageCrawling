import { api, readErrorResponse } from './client';
import type {
  AdapterSummary,
  AdaptersResponse,
  CrawlEvent,
  CrawlOptionsMeta,
  CrawlRequest,
  VerificationOpenStatus,
} from './contracts';

export function fetchCrawlOptions(): Promise<CrawlOptionsMeta> {
  return api.get<CrawlOptionsMeta>('/crawl/options');
}

/** 打开本机人工验证窗口（独立 profile，沿用任务代理） */
export async function openVerificationWindow(
  taskId: string,
): Promise<VerificationOpenStatus> {
  const response = await api.post<{ status: VerificationOpenStatus }>(
    `/crawl/tasks/${encodeURIComponent(taskId)}/verification`,
  );
  return response.status;
}

/** 取消等待中的人工验证 */
export async function cancelVerificationWindow(taskId: string): Promise<void> {
  await api.delete(`/crawl/tasks/${encodeURIComponent(taskId)}/verification`);
}

/** 站点适配器预设，仅用于表单自动填充，不影响未选择预设时的行为 */
export async function fetchAdapters(): Promise<AdapterSummary[]> {
  const response = await api.get<AdaptersResponse>('/adapters');
  return response.adapters;
}

/**
 * 通过 fetch + ReadableStream 消费 SSE，支持 AbortController 取消。
 */
export async function streamCrawl(
  request: CrawlRequest,
  onEvent: (event: CrawlEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/crawl/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok || !response.body) {
    throw await readErrorResponse(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const dataLine = frame
          .split('\n')
          .find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as CrawlEvent);
        } catch {
          // 忽略无法解析的帧
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
