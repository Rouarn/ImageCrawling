/**
 * 把多个 AbortSignal 合并为一个（任一触发即中止）。
 * 手动实现以兼容不同的运行时与 TS lib 版本。
 */
export function combineSignals(
  signals: Array<AbortSignal | undefined>,
): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal),
  );
  if (active.length === 1) return active[0];

  const controller = new AbortController();
  const listeners: Array<() => void> = [];

  const abort = () => {
    controller.abort();
    for (const remove of listeners) remove();
    listeners.length = 0;
  };

  for (const signal of active) {
    if (signal.aborted) {
      abort();
      break;
    }
    const onAbort = () => abort();
    signal.addEventListener('abort', onAbort, { once: true });
    listeners.push(() => signal.removeEventListener('abort', onAbort));
  }

  return controller.signal;
}

export function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return '请求超时或已被取消';
    }
    return error.message;
  }
  return String(error);
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('任务已取消', 'AbortError');
  }
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('任务已取消', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    timer.unref?.();
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('任务已取消', 'AbortError'));
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
