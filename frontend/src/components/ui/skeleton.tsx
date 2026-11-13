import { cn } from '@/lib/cn';

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-surface-inset',
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function SkeletonImageCard() {
  return (
    <div className="mb-4 break-inside-avoid rounded-2xl border border-line bg-surface p-2">
      <SkeletonBlock className="aspect-[4/3] w-full rounded-xl" />
      <div className="px-1 pb-1 pt-2.5">
        <SkeletonBlock className="h-3 w-3/4" />
        <SkeletonBlock className="mt-2 h-2.5 w-1/2" />
      </div>
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <SkeletonBlock className="h-[420px] w-full rounded-2xl" />
        <SkeletonBlock className="h-[420px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
