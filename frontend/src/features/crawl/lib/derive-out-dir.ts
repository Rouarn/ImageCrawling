/**
 * 根据目标 URL 推导一个一定合法的默认输出目录（后端允许更自然的命名，这里只做保守建议）。
 */
export function deriveOutDir(rawUrl: string): string {
  if (!rawUrl) return '';

  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname || '';
  } catch {
    const stripped = rawUrl.split('?')[0].split('#')[0];
    const index = stripped.lastIndexOf('/');
    pathname = index >= 0 ? stripped.slice(index) : stripped;
  }

  pathname = pathname.replace(/\/+$/, '');
  let segment = pathname.split('/').filter(Boolean).pop() || '';
  segment = segment.replace(/\.[^./?#]+$/, '');

  if (!segment) {
    try {
      segment = new URL(rawUrl).hostname.replace(/^www\./, '');
    } catch {
      // 忽略非法 URL，交由表单校验处理
    }
  }

  return segment
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
