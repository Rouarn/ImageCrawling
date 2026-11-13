/**
 * 根据目标 URL 推导默认输出目录（与后端 outDir 校验规则保持一致）。
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
