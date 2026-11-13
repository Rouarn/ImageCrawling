import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InboxOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Pagination } from 'antd';
import type { ImageItem } from '@/api/contracts';
import { toApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LibraryToolbar } from '@/features/library/components/library-toolbar';
import { ImageGrid, ImageGridSkeleton } from '@/features/library/components/image-grid';
import { SelectionBar } from '@/features/library/components/selection-bar';
import { useDeleteImages, useImageGroups, useImageList } from '@/features/library/queries';
import { useLibraryParams } from '@/features/library/lib/use-library-params';
import { confirmAction, notify } from '@/lib/notify';
import { formatCount } from '@/lib/format';

const PAGE_SIZE = 48;

export default function LibraryPage() {
  const { group, page, q, sort, update } = useLibraryParams();
  const { data: groupData } = useImageGroups();
  const { data, isLoading, isFetching, isError, error, refetch } = useImageList({
    group,
    page,
    q,
    sort,
    pageSize: PAGE_SIZE,
  });
  const deleteMutation = useDeleteImages();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === q) return;
      setSelected(new Set());
      update({ q: searchInput });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, q, update]);

  useEffect(() => {
    if (!data) return;
    const maxPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
    if (page > maxPage) update({ page: maxPage });
  }, [data, page, update]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtering = group !== 'all' || q.trim().length > 0;

  const runDelete = async (paths: string[]) => {
    try {
      const result = await deleteMutation.mutateAsync(paths);
      if (result.deleted.length > 0) {
        notify.success(`已删除 ${result.deleted.length} 张图片`);
      }
      if (result.failed.length > 0) {
        notify.error(
          `${result.failed.length} 张删除失败：${result.failed[0].message}`,
        );
      }
      return result;
    } catch (mutationError) {
      notify.error(toApiError(mutationError).message);
      return null;
    }
  };

  const handleDelete = async (item: ImageItem) => {
    const confirmed = await confirmAction({
      title: '删除这张图片？',
      content: `${item.name} · 删除后无法恢复`,
      okText: '删除',
      danger: true,
    });
    if (!confirmed) return;

    const result = await runDelete([item.path]);
    if (result) {
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(item.path);
        return next;
      });
    }
  };

  const handleBatchDelete = async () => {
    const paths = [...selected];
    if (paths.length === 0) return;
    const confirmed = await confirmAction({
      title: `删除选中的 ${paths.length} 张图片？`,
      content: '删除后无法恢复。',
      okText: '删除',
      danger: true,
    });
    if (!confirmed) return;

    const result = await runDelete(paths);
    if (result) {
      setSelected(new Set());
      if (result.deleted.length === paths.length) setSelectionMode(false);
    }
  };

  const handleCopy = async (item: ImageItem) => {
    try {
      const absolute = new URL(item.url, window.location.origin).href;
      await navigator.clipboard.writeText(absolute);
      notify.success('图片链接已复制');
    } catch {
      notify.error('复制失败，请手动复制');
    }
  };

  const handleToggleSelect = (path: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleGroupChange = (nextGroup: string) => {
    setSelected(new Set());
    update({ group: nextGroup });
  };

  const handleToggleSelectionMode = () => {
    setSelectionMode((value) => !value);
    setSelected(new Set());
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="图片库"
        description="点击图片可放大预览；支持按分组与文件名筛选，多选后可批量删除。"
        actions={
          <Badge tone="neutral">{formatCount(total)} 张</Badge>
        }
      />

      <LibraryToolbar
        groups={groupData?.groups ?? []}
        total={groupData?.total ?? 0}
        activeGroup={group}
        onGroupChange={handleGroupChange}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        sort={sort}
        onSortChange={(nextSort) => update({ sort: nextSort })}
        onRefresh={() => void refetch()}
        refreshing={isFetching && !isLoading}
        selectionMode={selectionMode}
        onToggleSelectionMode={handleToggleSelectionMode}
      />

      {isError ? (
        <div className="surface-card">
          <EmptyState
            icon={<WarningOutlined />}
            title="图片列表加载失败"
            description={toApiError(error).message}
            action={
              <Button onClick={() => void refetch()}>重新加载</Button>
            }
          />
        </div>
      ) : isLoading ? (
        <ImageGridSkeleton />
      ) : items.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={<InboxOutlined />}
            title={filtering ? '没有匹配的图片' : '图片库还是空的'}
            description={
              filtering
                ? '换个关键词或分组再试试，也可以清除筛选条件。'
                : '先去抓取一些图片，它们会自动出现在这里。'
            }
            action={
              filtering ? (
                <Button
                  onClick={() => {
                    setSelected(new Set());
                    update({ group: 'all', q: '' });
                  }}
                >
                  清除筛选
                </Button>
              ) : (
                <Link to="/">
                  <Button type="primary">去抓取图片</Button>
                </Link>
              )
            }
          />
        </div>
      ) : (
        <ImageGrid
          items={items}
          selectionMode={selectionMode}
          selectedPaths={selected}
          onToggleSelect={handleToggleSelect}
          onDelete={handleDelete}
          onCopy={handleCopy}
        />
      )}

      {total > PAGE_SIZE && (
        <div className="flex justify-center">
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            onChange={(nextPage) => update({ page: nextPage })}
            showTotal={(count) => `共 ${formatCount(count)} 张`}
          />
        </div>
      )}

      <SelectionBar
        count={selected.size}
        busy={deleteMutation.isPending}
        onClear={() => setSelected(new Set())}
        onDelete={() => void handleBatchDelete()}
      />
    </div>
  );
}
