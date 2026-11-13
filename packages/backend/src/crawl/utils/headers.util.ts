export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const DEFAULT_LANGUAGE_HEADER = 'zh-CN,zh;q=0.9,en;q=0.8';

/**
 * 自定义请求头统一小写 key、字符串化，null/undefined 直接忽略。
 */
export function normalizeHeaders(
  headers?: Record<string, unknown>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    const name = key.trim().toLowerCase();
    if (!name) continue;
    if (typeof value === 'string') {
      normalized[name] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      normalized[name] = String(value);
    }
  }
  return normalized;
}

export function buildHtmlHeaders(
  customHeaders?: Record<string, unknown>,
): Record<string, string> {
  const custom = normalizeHeaders(customHeaders);
  return {
    'user-agent': DEFAULT_USER_AGENT,
    'accept-language': DEFAULT_LANGUAGE_HEADER,
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    ...custom,
  };
}

export function buildImageHeaders(
  referer: string,
  customHeaders?: Record<string, unknown>,
): Record<string, string> {
  const custom = normalizeHeaders(customHeaders);
  return {
    'user-agent': DEFAULT_USER_AGENT,
    'accept-language': DEFAULT_LANGUAGE_HEADER,
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'sec-fetch-dest': 'image',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-origin',
    referer,
    ...custom,
  };
}

export function buildBrowserHeaders(
  customHeaders?: Record<string, unknown>,
): Record<string, string> {
  const custom = normalizeHeaders(customHeaders);
  const headers: Record<string, string> = {
    'accept-language': DEFAULT_LANGUAGE_HEADER,
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'upgrade-insecure-requests': '1',
    ...custom,
  };
  return headers;
}

/**
 * 从自定义请求头中取出 UA（大小写不敏感）。
 */
export function resolveUserAgent(
  customHeaders?: Record<string, unknown>,
): string | undefined {
  const custom = normalizeHeaders(customHeaders);
  return custom['user-agent'];
}
