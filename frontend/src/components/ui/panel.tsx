import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  headerClassName,
}: PanelProps) {
  const hasHeader = Boolean(title || actions);

  return (
    <section className={cn('surface-card flex flex-col overflow-hidden', className)}>
      {hasHeader && (
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6',
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={cn('flex-1 px-5 py-5 sm:px-6', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
