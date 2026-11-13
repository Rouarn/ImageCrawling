import { StatTile } from '@/components/ui/stat-tile';

interface TaskMetricsProps {
  planPages: number;
  completedPages: number;
  discovered: number;
  saved: number;
  failed: number;
}

export function TaskMetrics({
  planPages,
  completedPages,
  discovered,
  saved,
  failed,
}: TaskMetricsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile
        label="页数"
        value={planPages > 0 ? `${completedPages}/${planPages}` : '—'}
      />
      <StatTile label="发现" value={discovered} />
      <StatTile label="已保存" value={saved} tone="accent" />
      <StatTile
        label="失败"
        value={failed}
        tone={failed > 0 ? 'danger' : 'default'}
      />
    </div>
  );
}
