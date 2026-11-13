import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger';

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-inset text-ink-soft',
  accent: 'bg-accent-soft text-accent-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

const DOT_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-faint',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  pulse = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none',
        TONE_STYLES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'size-1.5 rounded-full',
            DOT_STYLES[tone],
            pulse && 'animate-pulse',
          )}
        />
      )}
      {children}
    </span>
  );
}
