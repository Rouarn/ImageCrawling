import {
  describeNetworkError,
  postImageBytes,
} from '../shared/import-api.js';
import { runPool } from '../shared/util.js';

/**
 * 后台兜底：
 * - 页面上取字节失败（跨域/CORS）时，用扩展权限重试；
 * - 下载文件交给 chrome.downloads，逐张返回失败原因。
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id) return;

  switch (message.type) {
    case 'ext:upload-one':
      uploadInBackground(message).then(sendResponse);
      return true;
    case 'ext:download':
      downloadAll(message.files).then((results) =>
        sendResponse({ ok: true, results }),
      );
      return true;
    case 'ext:open-options':
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    default:
      return;
  }
});

async function uploadInBackground(message) {
  let response;
  try {
    response = await fetch(message.url, {
      credentials: 'include',
      cache: 'force-cache',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return {
      ok: false,
      reason: `后台取图失败（${describeNetworkError(error)}）`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: `后台取图失败（HTTP ${response.status}${
        response.statusText ? ` ${response.statusText}` : ''
      }）`,
    };
  }
  const bytes = await response.arrayBuffer();
  return postImageBytes(bytes, {
    backendUrl: message.backendUrl,
    token: message.token,
    group: message.group,
    name: message.name,
    sourceUrl: message.sourceUrl,
  });
}

async function downloadAll(files) {
  const list = Array.isArray(files) ? files : [];
  return runPool(list, 3, async (file) => {
    try {
      const options = {
        url: file.url,
        conflictAction: 'uniquify',
        saveAs: false,
      };
      const name = safeFileName(file.name);
      if (name) options.filename = name;
      await chrome.downloads.download(options);
      return { url: file.url, name: file.name, ok: true };
    } catch (error) {
      return {
        url: file.url,
        name: file.name,
        ok: false,
        reason: error?.message || '浏览器拒绝下载',
      };
    }
  });
}

function safeFileName(raw) {
  if (!raw) return '';
  const base = String(raw).replace(/[/\\]/g, '-');
  return base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 120);
}
