import { Image } from 'antd';
import type { ImageItem } from '@/api/contracts';
import { ImageCard } from './image-card';
import { SkeletonImageCard } from '@/components/ui/skeleton';

interface ImageGridProps {
  items: ImageItem[];
  selectionMode: boolean;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onDelete: (item: ImageItem) => void;
  onCopy: (item: ImageItem) => void;
}

export function ImageGrid({
  items,
  selectionMode,
  selectedPaths,
  onToggleSelect,
  onDelete,
  onCopy,
}: ImageGridProps) {
  return (
    <Image.PreviewGroup>
      <div className="columns-2 gap-4 sm:columns-3 xl:columns-4 2xl:columns-5">
        {items.map((item) => (
          <ImageCard
            key={item.path}
            item={item}
            selectionMode={selectionMode}
            selected={selectedPaths.has(item.path)}
            onToggleSelect={onToggleSelect}
            onDelete={onDelete}
            onCopy={onCopy}
          />
        ))}
      </div>
    </Image.PreviewGroup>
  );
}

export function ImageGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="columns-2 gap-4 sm:columns-3 xl:columns-4 2xl:columns-5">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonImageCard key={index} />
      ))}
    </div>
  );
}
