import {
  ApiOutlined,
  DatabaseOutlined,
  PictureOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { NavLink } from 'react-router-dom';
import { Tooltip } from 'antd';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/cn';
import { formatCount, formatRelativeTime } from '@/lib/format';
import { useImageGroups } from '@/features/library/queries';
import { useSystemHealth } from '@/features/system/use-system-health';
import { isTaskActive, useCrawlTaskStore } from '@/stores/crawl-task-store';

const NAV_ITEMS = [
  { to: '/', label: '抓取任务', icon: <ThunderboltOutlined />, end: true },
  { to: '/library', label: '图片库', icon: <PictureOutlined />, end: false },
];

export function Sidebar() {
  const isRunning = useCrawlTaskStore((state) => isTaskActive(state.status));
  const { data: groupData } = useImageGroups();
  const { data: health, isError } = useSystemHealth();

  const total = groupData?.total ?? 0;
  const groups = groupData?.groups ?? [];
  const latest = groups.reduce<string | null>((acc, group) => {
    if (!group.updatedAt) return acc;
    if (!acc || group.updatedAt > acc) return group.updatedAt;
    return acc;
  }, null);

  const healthLabel = isError
    ? '服务离线'
    : health?.status === 'degraded'
      ? '存储只读'
      : '服务正常';
  const healthTone = isError
    ? 'bg-danger'
    : health?.status === 'degraded'
      ? 'bg-warning'
      : 'bg-success';

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-line bg-surface/70 backdrop-blur-xl lg:flex">
      <div className="px-5 pb-4 pt-6">
        <Brand />
      </div>

      <nav className="px-3 pt-2" aria-label="主导航">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Workspace
        </p>
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-soft text-accent-strong'
                    : 'text-ink-soft hover:bg-surface-muted hover:text-ink',
                )
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/' && isRunning && (
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-accent-strong">
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  运行中
                </span>
              )}
              {item.to === '/library' && total > 0 && (
                <span className="tabular ml-auto text-xs text-ink-faint">
                  {formatCount(total)}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="mt-auto space-y-3 px-4 pb-5">
        <div className="rounded-2xl border border-line bg-surface-muted p-4">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            <span>图片库</span>
            <DatabaseOutlined />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tabular text-2xl font-semibold text-ink">
              {formatCount(total)}
            </span>
            <span className="text-xs text-ink-soft">张图片</span>
          </div>
          <div className="mt-1 text-[11px] text-ink-faint">
            {groups.length} 个分组 · {latest ? `更新于 ${formatRelativeTime(latest)}` : '暂无内容'}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('size-1.5 shrink-0 rounded-full', healthTone)} />
            <span className="truncate text-[11px] text-ink-soft">
              {healthLabel}
              {health ? ` · v${health.version}` : ''}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle className="size-8 border-0" />
            <Tooltip title="API 文档">
              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                aria-label="打开 API 文档"
                className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-inset hover:text-ink"
              >
                <ApiOutlined />
              </a>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>
  );
}
