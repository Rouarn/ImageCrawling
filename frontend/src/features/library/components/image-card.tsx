import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { Image, Tooltip } from 'antd';
import type { ImageItem } from '@/api/contracts';
import { cn } from '@/lib/cn';
import { formatBytes, formatRelativeTime } from '@/lib/format';

interface ImageCardProps {
  item: ImageItem;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (path: string) => void;
  onDelete: (item: ImageItem) => void;
  onCopy: (item: ImageItem) => void;
}

export function ImageCard({
  item,
  selectionMode,
  selected,
  onToggleSelect,
  onDelete,
  onCopy,
}: ImageCardProps) {
  return (
    <figure
      className={cn(
        'group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border bg-surface transition duration-200',
        selected
          ? 'border-accent ring-2 ring-accent/25'
          : 'border-line hover:border-line-strong hover:shadow-card',
      )}
    >
      <div className="relative overflow-hidden bg-surface-inset">
        <Image
          src={item.url}
          alt={item.name}
          loading="lazy"
          className="block h-auto w-full"
          rootClassName="block w-full"
          preview={selectionMode ? false : { mask: false }}
        />

        {selectionMode && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-10 cursor-pointer"
              aria-label={selected ? `取消选择 ${item.name}` : `选择 ${item.name}`}
              onClick={() => onToggleSelect(item.path)}
            />
            <span
              className={cn(
                'pointer-events-none absolute left-2.5 top-2.5 z-20 flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors',
                selected
                  ? 'border-accent bg-accent text-white'
                  : 'border-white/70 bg-black/35 text-transparent backdrop-blur',
              )}
            >
              {selected ? '✓' : ''}
            </span>
          </>
        )}

        {!selectionMode && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1.5 bg-gradient-to-b from-black/50 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-sm:opacity-100">
            <Tooltip title="复制图片链接">
              <button
                type="button"
                onClick={() => onCopy(item)}
                aria-label={`复制 ${item.name} 的链接`}
                className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
              >
                <CopyOutlined />
              </button>
            </Tooltip>
            <Tooltip title="删除图片">
              <button
                type="button"
                onClick={() => onDelete(item)}
                aria-label={`删除 ${item.name}`}
                className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur transition hover:bg-danger"
              >
                <DeleteOutlined />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <figcaption className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div
            className="truncate text-xs font-medium text-ink"
            title={item.name}
          >
            {item.name}
          </div>
          <div className="tabular mt-0.5 text-[10px] text-ink-faint">
            {formatBytes(item.size)} · {formatRelativeTime(item.updatedAt)}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}
