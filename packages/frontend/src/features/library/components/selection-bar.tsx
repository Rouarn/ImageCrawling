import { Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

interface SelectionBarProps {
  count: number;
  busy: boolean;
  onClear: () => void;
  onDelete: () => void;
}

export function SelectionBar({
  count,
  busy,
  onClear,
  onDelete,
}: SelectionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card lg:bottom-8">
      <span className="text-xs text-ink-soft">
        已选择 <span className="tabular font-semibold text-ink">{count}</span> 张
      </span>
      <div className="flex items-center gap-2">
        <Button size="small" onClick={onClear} disabled={busy}>
          取消选择
        </Button>
        <Button
          size="small"
          danger
          type="primary"
          icon={<DeleteOutlined />}
          loading={busy}
          onClick={onDelete}
        >
          删除所选
        </Button>
      </div>
    </div>
  );
}
