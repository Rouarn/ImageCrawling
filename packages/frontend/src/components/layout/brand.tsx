import { useId } from 'react';
import { cn } from '@/lib/cn';

interface BrandProps {
  compact?: boolean;
  className?: string;
}

export function Brand({ compact = false, className }: BrandProps) {
  const gradientId = useId();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className="size-9 shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="8"
            y1="8"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#6d6ff5" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
        <rect
          x="16"
          y="20"
          width="32"
          height="24"
          rx="6"
          stroke="#fff"
          strokeWidth="3.5"
        />
        <circle cx="32" cy="32" r="7" stroke="#fff" strokeWidth="3.5" />
        <circle cx="42.5" cy="25.5" r="2.2" fill="#fff" />
      </svg>
      {!compact && (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-ink">
            Image Crawler
          </div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Personal Workbench
          </div>
        </div>
      )}
    </div>
  );
}
