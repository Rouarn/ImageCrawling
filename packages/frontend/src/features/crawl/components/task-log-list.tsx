import { useEffect, useRef } from 'react';
import type { TaskLogEntry } from '@/stores/crawl-task-store';
import { cn } from '@/lib/cn';

const LEVEL_DOT: Record<TaskLogEntry['level'], string> = {
  info: 'bg-accent',
  warn: 'bg-warning',
  error: 'bg-danger',
};

const LEVEL_TEXT: Record<TaskLogEntry['level'], string> = {
  info: 'text-ink-soft',
  warn: 'text-warning',
  error: 'text-danger',
};

interface TaskLogListProps {
  logs: TaskLogEntry[];
  running: boolean;
}

export function TaskLogList({ logs, running }: TaskLogListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stickToBottom.current) return;
    container.scrollTop = container.scrollHeight;
  }, [logs]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    stickToBottom.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 48;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-[280px] overflow-y-auto rounded-xl border border-line bg-surface-muted px-2 py-2"
      role="log"
      aria-live="polite"
      aria-label="任务日志"
    >
      {logs.length === 0 && (
        <div className="flex h-full items-center justify-center text-xs text-ink-faint">
          {running ? '等待任务事件…' : '暂无日志'}
        </div>
      )}

      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-inset/70"
        >
          <span className="tabular w-[58px] shrink-0 pt-0.5 text-[10px] text-ink-faint">
            {log.time}
          </span>
          <span
            className={cn(
              'mt-1 size-1.5 shrink-0 rounded-full',
              LEVEL_DOT[log.level],
            )}
          />
          <span
            className={cn(
              'min-w-0 flex-1 break-words text-xs leading-relaxed',
              LEVEL_TEXT[log.level],
            )}
          >
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
}
