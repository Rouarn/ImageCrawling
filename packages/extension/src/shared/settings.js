export const DEFAULT_BACKEND = 'http://127.0.0.1:5678';

export const DEFAULT_SETTINGS = {
  backendUrl: DEFAULT_BACKEND,
  token: '',
};

/** 读取扩展设置（chrome.storage.local，令牌不进入同步空间） */
export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    backendUrl: normalizeBackendUrl(stored.backendUrl),
    token: String(stored.token ?? '').trim(),
  };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    token: String(settings.token ?? '').trim(),
  });
}

/** 去掉结尾斜杠；缺协议时补 http:// */
export function normalizeBackendUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return DEFAULT_BACKEND;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  return withProtocol.replace(/\/+$/, '');
}
