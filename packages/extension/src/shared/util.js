const FORMAT_ALIASES = {
  jpeg: 'jpg',
  jpe: 'jpg',
  pjpeg: 'jpg',
  tif: 'tiff',
  ico: 'ico',
  svg: 'svg',
};

/** 从 URL 猜测图片格式；无法判断时返回空字符串 */
export function formatFromUrl(url) {
  try {
    const pathname = new URL(url, 'http://localhost').pathname;
    // 兼容站点在扩展名后追加的处理标记，例如 photo.jpg!lrg
    const direct = /\.([a-z0-9]+)$/i.exec(pathname);
    const decorated = /\.([a-z0-9]+)[^a-z0-9/][^/]*$/i.exec(pathname);
    const match = direct ?? decorated;
    if (!match) return '';
    const ext = match[1].toLowerCase();
    return FORMAT_ALIASES[ext] ?? ext;
  } catch {
    return '';
  }
}

/** 从 URL 生成可读文件名（不含扩展名时后端会按内容补齐） */
export function fileNameFromUrl(url) {
  try {
    const pathname = new URL(url, 'http://localhost').pathname;
    const raw = pathname.split('/').filter(Boolean).pop() ?? '';
    const decoded = safeDecode(raw);
    return decoded || 'image';
  } catch {
    return 'image';
  }
}

export function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 页面分组默认值：优先标题，标题为空时退回域名 */
export function defaultGroupName(title, hostname) {
  const cleanTitle = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanTitle) return cleanTitle.slice(0, 120);
  return domainSlug(hostname) || 'images';
}

export function domainSlug(hostname) {
  return String(hostname ?? '')
    .replace(/^www\./i, '')
    .trim();
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/** 简单并发池，保持结果顺序 */
export async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** 把 fetch 错误翻译成可读原因 */
export function describeFetchError(error) {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'AbortError') return '请求超时（20s）';
  const message = error.message || '网络错误';
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '网络错误（跨域被拒或连接失败）';
  }
  return message;
}
