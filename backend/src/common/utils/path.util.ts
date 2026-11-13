import * as path from 'node:path';

/**
 * 判断 candidate 是否位于 root 目录内（含 root 本身）。
 * 使用 path.relative 避免 `/library-evil` 这类前缀误判。
 */
export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

/**
 * 统一使用 POSIX 分隔符表示相对路径，便于作为 URL 片段传输。
 */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * 逐段编码相对路径，保留 `/` 分隔符。
 */
export function encodePathSegments(relativePath: string): string {
  return relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
