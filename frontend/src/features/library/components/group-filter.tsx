import type { ImageGroup } from '@/api/contracts';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';

interface GroupFilterProps {
  groups: ImageGroup[];
  total: number;
  activeGroup: string;
  onChange: (group: string) => void;
}

export function GroupFilter({
  groups,
  total,
  activeGroup,
  onChange,
}: GroupFilterProps) {
  const items = [
    { key: 'all', label: '全部', count: total },
    ...groups.map((group) => ({
      key: group.key,
      label: group.label,
      count: group.count,
    })),
  ];

  return (
    <div
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="图片分组"
    >
      {items.map((item) => {
        const active = item.key === activeGroup;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-transparent bg-ink text-[var(--canvas)]'
                : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
            )}
          >
            <span className="max-w-[180px] truncate">{item.label}</span>
            <span
              className={cn(
                'tabular text-[10px]',
                active ? 'opacity-70' : 'text-ink-faint',
              )}
            >
              {formatCount(item.count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
