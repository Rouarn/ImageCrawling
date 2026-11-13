import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  isTaskActive,
  useCrawlTaskStore,
  type TaskStatus,
} from '@/stores/crawl-task-store';
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

  useEffect(() => {
    const wasRunning = isTaskActive(previousStatus.current);

    if (wasRunning && status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: imageQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: imageQueryKeys.groups });
      // saved / failed 来自 complete 事件的累计值，直接展示总量；
      // 不要用「本次 saved 减去上一次 saved」的增量，那会退化成最后一次进度 +1。
      if (saved > 0 || failed > 0) {
        const summary = `抓取完成：成功 ${saved} 张，失败 ${failed} 张`;
        if (failed > 0) notify.warning(summary);
        else notify.success(summary);
      } else {
        notify.info('抓取完成：没有新增图片');
      }
    }

    if (wasRunning && status === 'failed' && error) {
      notify.error(`${error.message}（${error.code}）`);
    }

    if (wasRunning && status === 'cancelled') {
      notify.warning('任务已取消');
    }

    previousStatus.current = status;
  }, [status, saved, failed, error, queryClient]);

  return null;
}
