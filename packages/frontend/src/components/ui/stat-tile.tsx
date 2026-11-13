import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'danger';
  className?: string;
}

const VALUE_TONES = {
  default: 'text-ink',
  accent: 'text-accent-strong',
  success: 'text-success',
  danger: 'text-danger',
};

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface-muted px-3 py-2.5',
        className,
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
      <div
        className={cn(
          'tabular mt-1 text-lg font-semibold leading-none',
          VALUE_TONES[tone],
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  );
}
