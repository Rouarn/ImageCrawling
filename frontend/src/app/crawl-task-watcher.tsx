import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { useCrawlTaskStore, type TaskStatus } from '@/stores/crawl-task-store';
import { imageQueryKeys } from '@/features/library/queries';

/**
 * 全局监听抓取任务状态，任务结束时刷新图片库并提示。
 */
export function CrawlTaskWatcher(): null {
  const queryClient = useQueryClient();
  const status = useCrawlTaskStore((state) => state.status);
  const saved = useCrawlTaskStore((state) => state.saved);
  const failed = useCrawlTaskStore((state) => state.failed);
  const error = useCrawlTaskStore((state) => state.error);
  const previousStatus = useRef<TaskStatus>(status);
  const previousSaved = useRef(saved);

  useEffect(() => {
    const wasRunning = previousStatus.current === 'running';
    const lastSaved = previousSaved.current;

    if (wasRunning && status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: imageQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: imageQueryKeys.groups });
      if (saved > lastSaved) {
        notify.success(`抓取完成，新增 ${saved - lastSaved} 张图片`);
      } else {
        notify.info('抓取完成，没有新增图片');
      }
    }

    if (wasRunning && status === 'failed' && error) {
      notify.error(`${error.message}（${error.code}）`);
    }

    if (wasRunning && status === 'cancelled') {
      notify.warning('任务已取消');
    }

    previousStatus.current = status;
    previousSaved.current = saved;
  }, [status, saved, failed, error, queryClient]);

  return null;
}
