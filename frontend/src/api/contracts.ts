export interface CrawlRequest {
  url: string;
  outDir?: string;
  maxPages?: number;
  concurrency?: number;
  pageDelayMs?: number;
  fetchTimeoutMs?: number;
  pagePattern?: string;
  startPage?: number;
  endPage?: number;
  useHeadless?: boolean;
  headers?: Record<string, string>;
}

export interface CrawlDefaults {
  maxPages: number;
  concurrency: number;
  pageDelayMs: number;
  fetchTimeoutMs: number;
}

export interface CrawlLimits {
  maxPages: number;
  concurrency: number;
  pageDelayMs: number;
  fetchTimeoutMs: number;
}

export interface CrawlOptionsMeta {
  defaults: CrawlDefaults;
  limits: CrawlLimits;
}

export type CrawlLogLevel = 'info' | 'warn' | 'error';
export type CrawlMode = 'auto' | 'pattern';
export type FetchMode = 'static' | 'headless';

export type CrawlEvent =
  | { type: 'start'; requestId: string; outDir: string; startedAt: string }
  | { type: 'log'; level: CrawlLogLevel; message: string }
  | { type: 'plan'; mode: CrawlMode; pages: number; urls: string[] }
  | { type: 'page-start'; index: number; total: number; url: string }
  | {
      type: 'page-done';
      index: number;
      total: number;
      url: string;
      found: number;
      added: number;
      mode: FetchMode;
      durationMs: number;
    }
  | { type: 'page-fallback'; index: number; url: string; reason: string }
  | { type: 'page-failed'; index: number; url: string; message: string }
  | { type: 'discover'; count: number; pages: number }
  | { type: 'download-start'; total: number }
  | {
      type: 'download-progress';
      done: number;
      total: number;
      saved: number;
      failed: number;
      file?: string;
    }
  | {
      type: 'complete';
      discovered: number;
      saved: number;
      failed: number;
      outDir: string;
      durationMs: number;
    }
  | {
      type: 'error';
      error: { code: string; message: string; details?: unknown };
    };

export interface ImageItem {
  path: string;
  name: string;
  group: string;
  url: string;
  size: number;
  updatedAt: string;
  width?: number;
  height?: number;
  type?: string;
}

export interface ImageGroup {
  key: string;
  label: string;
  count: number;
  updatedAt: string | null;
}

export interface ImageGroupsResponse {
  groups: ImageGroup[];
  total: number;
}

export interface ImageListResponse {
  items: ImageItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type ImageSort = 'name' | 'newest';

export interface ImageListQuery {
  group?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: ImageSort;
}

export interface DeleteImagesResponse {
  deleted: string[];
  failed: Array<{ path: string; code: string; message: string }>;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  storage: { root: string; writable: boolean };
  headless: { available: boolean };
}
