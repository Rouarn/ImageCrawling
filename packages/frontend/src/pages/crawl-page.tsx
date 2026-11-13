import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { CrawlForm } from '@/features/crawl/components/crawl-form';
import { TaskConsole } from '@/features/crawl/components/task-console';
import { useCrawlTaskStore, isTaskActive } from '@/stores/crawl-task-store';

export default function CrawlPage() {
  const status = useCrawlTaskStore((state) => state.status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Crawl"
        title="抓取任务"
        description="输入目标页面，自动识别分页并并发下载图片；全程实时进度与日志可见。"
        actions={
          status === 'verifying' ? (
            <Badge tone="warning" dot pulse>
              等待人工验证
            </Badge>
          ) : isTaskActive(status) ? (
            <Badge tone="accent" dot pulse>
              任务运行中
            </Badge>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start">
        <CrawlForm />
        <TaskConsole />
      </div>
    </div>
  );
}
