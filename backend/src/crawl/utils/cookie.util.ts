import type { Cookie } from 'puppeteer';

/** 把 Cookie 列表序列化成请求头，空值自动忽略 */
export function serializeCookieHeader(cookies: Cookie[]): string {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

/**
 * 解析 Cookie 请求头，供无头页面注入 document.cookie。
 * 无法解析的片段直接跳过，不影响页面加载。
 */
export function parseCookieHeader(
  header: string,
  url: string,
): Array<{ name: string; value: string; url: string }> {
  const result: Array<{ name: string; value: string; url: string }> = [];
  for (const part of header.split(';')) {
    const segment = part.trim();
    if (!segment) continue;
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!name) continue;
    result.push({ name, value, url });
  }
  return result;
}
