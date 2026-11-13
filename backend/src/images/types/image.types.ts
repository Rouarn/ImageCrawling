export interface StoredImageFile {
  /** 相对存储根目录的 POSIX 路径 */
  path: string;
  /** 文件名 */
  name: string;
  /** 所属分组（顶层目录名，直接位于根目录时为 root） */
  group: string;
  size: number;
  updatedAt: string;
}

export interface ImageGroupSummary {
  key: string;
  count: number;
  updatedAt: string | null;
}

export interface DeleteFailure {
  path: string;
  code: string;
  message: string;
}

export interface DeleteOutcome {
  deleted: string[];
  failed: DeleteFailure[];
}

export type ImageSort = 'name' | 'newest';
