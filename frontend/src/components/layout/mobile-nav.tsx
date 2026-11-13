import {
  ApiOutlined,
  PictureOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { NavLink } from 'react-router-dom';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/cn';
import { useCrawlTaskStore } from '@/stores/crawl-task-store';

const NAV_ITEMS = [
  { to: '/', label: '抓取任务', icon: <ThunderboltOutlined />, end: true },
  { to: '/library', label: '图片库', icon: <PictureOutlined />, end: false },
];

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-xl lg:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <ThemeToggle className="size-8" />
        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          aria-label="打开 API 文档"
          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-inset hover:text-ink"
        >
          <ApiOutlined />
        </a>
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const isRunning = useCrawlTaskStore((state) => state.status === 'running');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="移动端导航"
    >
      <div className="grid grid-cols-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-accent-strong' : 'text-ink-faint hover:text-ink',
              )
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
            {item.to === '/' && isRunning && (
              <span className="absolute right-[calc(50%-22px)] top-2 size-1.5 animate-pulse rounded-full bg-accent" />
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
