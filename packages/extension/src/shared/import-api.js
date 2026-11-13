/** 与后端导入接口通信的最小封装（页面上下文与 service worker 共用） */

export function importEndpoint(backendUrl, group, name, sourceUrl) {
  const params = new URLSearchParams({ group });
  if (name) params.set('name', name);
  if (sourceUrl) params.set('sourceUrl', sourceUrl);
  return `${backendUrl}/api/import/image?${params.toString()}`;
}

/** 统一用 application/octet-stream 发送，由后端按文件头识别真实类型 */
export async function postImageBytes(bytes, options) {
  let response;
  try {
    response = await fetch(
      importEndpoint(
        options.backendUrl,
        options.group,
        options.name,
        options.sourceUrl,
      ),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-import-token': options.token,
        },
        body: bytes,
      },
    );
  } catch (error) {
    return {
      ok: false,
      reason: `无法连接后端（${describeNetworkError(error)}）`,
    };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    return { ok: false, reason: errorMessage(payload, response.status) };
  }
  return {
    ok: true,
    duplicate: Boolean(payload.data?.duplicate),
    path: payload.data?.path,
    url: payload.data?.url,
  };
}

export function errorMessage(payload, status) {
  const message = payload?.error?.message;
  if (message) return message;
  return `HTTP ${status}`;
}

export function describeNetworkError(error) {
  const message = error?.message || String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '网络错误（跨域被拒或连接失败）';
  }
  return message;
}
