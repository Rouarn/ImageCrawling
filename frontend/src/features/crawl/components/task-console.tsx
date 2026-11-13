import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BranchesOutlined,
  ClearOutlined,
  CopyOutlined,
  ExperimentOutlined,
  LoadingOutlined,
  RadarChartOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Button, Progress } from 'antd';
import { Panel } from '@/components/ui/panel';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskMetrics } from './task-metrics';
import { TaskLogList } from './task-log-list';
import { ChallengeCard } from './challenge-card';
import {
  isTaskActive,
  useCrawlTaskStore,
  type TaskStatus,
} from '@/stores/crawl-task-store';
import { formatDuration } from '@/lib/format';
import { copyText } from '@/lib/clipboard';
import { notify } from '@/lib/notify';

const STATUS_META: Record<
  TaskStatus,
  { label: string; tone: BadgeTone; dot: boolean; pulse?: boolean }
> = {
  idle: { label: '待命', tone: 'neutral', dot: true },
  running: { label: '运行中', tone: 'accent', dot: true, pulse: true },
  verifying: { label: '等待人工验证', tone: 'warning', dot: true, pulse: true },
  completed: { label: '已完成', tone: 'success', dot: true },
  failed: { label: '失败', tone: 'danger', dot: true },
  cancelled: { label: '已取消', tone: 'warning', dot: true },
};

const TIPS = [
  {
    icon: <SyncOutlined />,
    title: '自动翻页',
    text: '识别 rel=next、.next 与“下一页”',
  },
  {
    icon: <BranchesOutlined />,
    title: '分页模板',
    text: '用 {page} 占位符构造任意分页 URL',
  },
  {
    icon: <ExperimentOutlined />,
    title: '动态渲染',
    text: '无头模式可抓取 JS 加载的图片',
  },
];

export function TaskConsole() {
  const navigate = useNavigate();
  const status = useCrawlTaskStore((state) => state.status);
  const logs = useCrawlTaskStore((state) => state.logs);
  const planPages = useCrawlTaskStore((state) => state.planPages);
  const completedPages = useCrawlTaskStore((state) => state.completedPages);
  const discovered = useCrawlTaskStore((state) => state.discovered);
  const downloadTotal = useCrawlTaskStore((state) => state.downloadTotal);
  const downloadDone = useCrawlTaskStore((state) => state.downloadDone);
  const saved = useCrawlTaskStore((state) => state.saved);
  const failed = useCrawlTaskStore((state) => state.failed);
  const currentPage = useCrawlTaskStore((state) => state.currentPage);
  const durationMs = useCrawlTaskStore((state) => state.durationMs);
  const outDir = useCrawlTaskStore((state) => state.outDir);
  const error = useCrawlTaskStore((state) => state.error);
  const cancel = useCrawlTaskStore((state) => state.cancel);
  const reset = useCrawlTaskStore((state) => state.reset);

  const meta = STATUS_META[status];

  const percent = useMemo(() => {
    if (downloadTotal > 0) {
      return Math.min(100, Math.round((downloadDone / downloadTotal) * 100));
    }
    if (planPages > 0) {
      return Math.min(100, Math.round((completedPages / planPages) * 100));
    }
    return status === 'running' || status === 'verifying' ? 6 : 0;
  }, [downloadTotal, downloadDone, planPages, completedPages, status]);

  const progressLabel =
    downloadTotal > 0
      ? `${downloadDone}/${downloadTotal} 下载`
      : planPages > 0
        ? `${completedPages}/${planPages} 页`
        : status === 'verifying'
          ? '等待验证'
          : status === 'running'
            ? '准备中'
            : '—';

  const handleCopyLogs = async () => {
    if (logs.length === 0) {
      notify.info('暂无日志可复制');
      return;
    }
    // 从 store 取全量日志（含已滚出视口的行），不使用 DOM 中可见的部分
    const text = logs
      .map((log) => `[${log.time}] ${log.level.toUpperCase()} ${log.message}`)
      .join('\n');
    try {
      await copyText(text);
      notify.success(`已复制全部日志（${logs.length} 条）`);
    } catch {
      notify.error('复制失败：浏览器拒绝了剪贴板访问');
    }
  };

  return (
    <Panel
      title="任务控制台"
      description="实时接收后端推送的结构化抓取事件"
      className="min-h-[520px]"
      actions={
        <>
          <Badge tone={meta.tone} dot pulse={meta.pulse}>
            {meta.label}
          </Badge>
          {isTaskActive(status) ? (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={cancel}
            >
              取消
            </Button>
          ) : (
            status !== 'idle' && (
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={reset}
              >
                清空
              </Button>
            )
          )}
        </>
      }
      bodyClassName="flex flex-col gap-4 p-5 sm:p-6"
    >
      {status === 'idle' ? (
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            icon={<RadarChartOutlined />}
            title="等待新的抓取任务"
            description="填写目标页面并点击“开始抓取”，分页、下载与失败信息都会实时出现在这里。"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPS.map((tip) => (
              <div
                key={tip.title}
                className="rounded-xl border border-line bg-surface-muted p-3"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-ink">
                  <span className="text-accent">{tip.icon}</span>
                  {tip.title}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                  {tip.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <TaskMetrics
            planPages={planPages}
            completedPages={completedPages}
            discovered={discovered}
            saved={saved}
            failed={failed}
          />

          <div className="flex items-center gap-3">
            <Progress
              percent={percent}
              showInfo={false}
              strokeColor="var(--accent)"
              railColor="var(--surface-inset)"
              className="!mb-0 flex-1"
            />
            <span className="tabular w-24 text-right text-xs text-ink-soft">
              {progressLabel}
            </span>
          </div>

          {status === 'verifying' && <ChallengeCard />}

          {status === 'running' && currentPage && (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs text-ink-soft">
              <LoadingOutlined spin className="text-accent" />
              正在处理 {currentPage}
            </div>
          )}

          {status === 'failed' && error && (
            <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-xs text-danger">
              <div className="font-semibold">
                任务失败 · {error.code}
              </div>
              <p className="mt-1 leading-relaxed">{error.message}</p>
            </div>
          )}

          {status === 'completed' && (
            <div className="rounded-xl border border-success/30 bg-success-soft px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-success">
                    任务完成
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="tabular text-2xl font-semibold text-ink">
                      {saved}
                    </span>
                    <span className="text-xs text-ink-soft">张图片已保存</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-soft">
                    失败 {failed} · 用时 {formatDuration(durationMs)}
                    {outDir ? ` · storage/${outDir}` : ''}
                  </div>
                </div>
                <Button type="primary" onClick={() => navigate('/library')}>
                  查看图片库
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-soft">
              任务日志
              <span className="ml-1 text-ink-faint">（{logs.length} 条）</span>
            </span>
            <Button
              size="small"
              icon={<CopyOutlined />}
              aria-label="复制全部日志"
              title="复制全部日志（含已滚出视口的历史行）"
              onClick={() => void handleCopyLogs()}
            >
              复制全部
            </Button>
          </div>

          <TaskLogList logs={logs} running={isTaskActive(status)} />
        </>
      )}
    </Panel>
  );
}
