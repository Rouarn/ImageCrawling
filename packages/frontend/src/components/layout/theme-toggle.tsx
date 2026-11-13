import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { cn } from '@/lib/cn';
import { useIsDarkMode, useThemeStore } from '@/stores/theme-store';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const isDark = useIsDarkMode();
  const setMode = useThemeStore((state) => state.setMode);
  const label = isDark ? '切换到浅色模式' : '切换到深色模式';

  return (
    <Tooltip title={label}>
      <button
        type="button"
        onClick={() => setMode(isDark ? 'light' : 'dark')}
        aria-label={label}
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-xl border border-line text-ink-soft transition hover:bg-surface-inset hover:text-ink',
          className,
        )}
      >
        {isDark ? <SunOutlined /> : <MoonOutlined />}
      </button>
    </Tooltip>
  );
}
