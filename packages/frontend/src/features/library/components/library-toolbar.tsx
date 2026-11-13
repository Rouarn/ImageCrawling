import {
  CheckSquareOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Tooltip } from 'antd';
import type { ImageGroup, ImageSort } from '@/api/contracts';
import { GroupFilter } from './group-filter';

interface LibraryToolbarProps {
  groups: ImageGroup[];
  total: number;
  activeGroup: string;
  onGroupChange: (group: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  sort: ImageSort;
  onSortChange: (sort: ImageSort) => void;
  onRefresh: () => void;
  refreshing: boolean;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
}

export function LibraryToolbar({
  groups,
  total,
  activeGroup,
  onGroupChange,
  searchValue,
  onSearchChange,
  sort,
  onSortChange,
  onRefresh,
  refreshing,
  selectionMode,
  onToggleSelectionMode,
}: LibraryToolbarProps) {
  return (
    <div className="surface-card space-y-3 p-3 sm:p-4">
      <GroupFilter
        groups={groups}
        total={total}
        activeGroup={activeGroup}
        onChange={onGroupChange}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          allowClear
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          prefix={<SearchOutlined className="text-ink-faint" />}
          placeholder="按文件名搜索"
          className="!w-full sm:!w-56"
          aria-label="按文件名搜索"
        />

        <Select<ImageSort>
          value={sort}
          onChange={onSortChange}
          className="!w-32"
          options={[
            { value: 'name', label: '按名称' },
            { value: 'newest', label: '最新优先' },
          ]}
          aria-label="排序方式"
        />

        <div className="ml-auto flex items-center gap-2">
          <Tooltip title={selectionMode ? '退出选择模式' : '多选并批量删除'}>
            <Button
              icon={
                selectionMode ? <CloseCircleOutlined /> : <CheckSquareOutlined />
              }
              type={selectionMode ? 'primary' : 'default'}
              onClick={onToggleSelectionMode}
            >
              <span className="hidden sm:inline">
                {selectionMode ? '退出选择' : '选择'}
              </span>
            </Button>
          </Tooltip>

          <Tooltip title="刷新列表">
            <Button
              icon={<ReloadOutlined />}
              onClick={onRefresh}
              loading={refreshing}
              aria-label="刷新列表"
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
