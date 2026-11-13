import {
  describeNetworkError,
  postImageBytes,
} from '../shared/import-api.js';
import { describeFetchError, runPool } from '../shared/util.js';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.needsConfig = true;
  }
}

/** 保存前校验设置，缺令牌时给出可操作的提示 */
export function assertConfig(settings) {
  if (!settings.token) {
    throw new ConfigError(
      '尚未填写导入令牌。请在扩展设置里填写与后端 IMPORT_TOKEN 一致的令牌，然后重试。',
    );
  }
  try {
    new URL(settings.backendUrl);
  } catch {
    throw new ConfigError(
      '后端地址不合法。请在扩展设置里填写，例如 http://127.0.0.1:5678',
    );
  }
}

/**
 * 逐张保存：优先在页面上下文取字节（带页面 Cookie），
 * 跨域被拒时交给后台 service worker 用扩展权限重试。
 */
export async function saveImages(urls, options) {
  const { settings, group, sourceUrl, getName, onProgress } = options;
  assertConfig(settings);
  let done = 0;
  const results = await runPool(urls, 3, async (url) => {
    const name = getName?.(url) ?? '';
    const result = await importOne(url, settings, group, name, sourceUrl);
    done += 1;
    onProgress?.(done, urls.length);
    return { url, name, ...result };
  });
  return summarize(results, 'save');
}

export function summarize(results, kind) {
  const failures = results
    .filter((result) => !result.ok)
    .map((result) => ({
      url: result.url,
      name: result.name || result.url,
      reason: result.reason || '未知错误',
    }));
  const duplicate = results.filter((r) => r.ok && r.duplicate).length;
  const success = results.filter((r) => r.ok && !r.duplicate).length;
  return {
    kind,
    total: results.length,
    success,
    duplicate,
    failed: failures.length,
    failures,
  };
}

async function importOne(url, settings, group, name, sourceUrl) {
  let pageError = '';
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'force-cache',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      pageError = `HTTP ${response.status}${
        response.statusText ? ` ${response.statusText}` : ''
      }`;
    } else {
      const bytes = await response.arrayBuffer();
      return await postImageBytes(bytes, {
        backendUrl: settings.backendUrl,
        token: settings.token,
        group,
        name,
        sourceUrl,
      });
    }
  } catch (error) {
    pageError = describeFetchError(error);
  }

  const fallback = await uploadViaBackground(
    url,
    settings,
    group,
    name,
    sourceUrl,
  );
  if (fallback.ok) return fallback;
  return {
    ok: false,
    reason: `页面取图失败（${pageError}）；后台重试失败（${fallback.reason}）`,
  };
}

async function uploadViaBackground(url, settings, group, name, sourceUrl) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ext:upload-one',
      url,
      backendUrl: settings.backendUrl,
      token: settings.token,
      group,
      name,
      sourceUrl,
    });
    if (!response) return { ok: false, reason: '后台无响应' };
    return response;
  } catch (error) {
    return { ok: false, reason: describeNetworkError(error) };
  }
}

/** 下载交给后台，浏览器下载记录里可见 */
export async function downloadImages(files, options) {
  const { onProgress } = options ?? {};
  const response = await chrome.runtime.sendMessage({
    type: 'ext:download',
    files,
  });
  if (!response?.ok) {
    throw new Error(response?.error || '后台下载失败');
  }
  const result = summarize(response.results, 'download');
  onProgress?.(result.total, result.total);
  return result;
}
