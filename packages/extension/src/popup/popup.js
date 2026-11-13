import { ImagePanel } from '../content/panel.js';
import { watchTheme, getThemeMode, applyTheme } from '../shared/theme.js';

let tabId = null;
let refreshTimer = null;

void (async () => {
  const mode = await getThemeMode();
  applyTheme(document.documentElement, mode);
  watchTheme(async () => applyTheme(document.documentElement, await getThemeMode()));
})();

const panel = new ImagePanel({
  mode: 'popup',
  actions: {
    async save({ urls, group, onProgress }) {
      return runInTab({ type: 'ext:save', urls, group }, onProgress);
    },
    async download({ files, onProgress }) {
      return runInTab({ type: 'ext:download', files }, onProgress);
    },
    openSettings() {
      chrome.runtime.openOptionsPage();
    },
  },
});

panel.mount(document.getElementById('app'));

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    panel.showNotice('没有可用的标签页', '请在普通网页中使用扩展。');
    return;
  }
  tabId = tab.id;
  await refresh();
}

async function refresh() {
  if (!tabId) return;
  try {
    const data = await chrome.tabs.sendMessage(tabId, { type: 'ext:list' });
    if (!data?.ok) throw new Error('empty');
    panel.setData(data.items, data.meta);
  } catch {
    panel.setData([], { title: '', domain: '', groupDefault: 'images' });
    panel.showNotice(
      '无法读取当前页面',
      '扩展刚安装或更新后需要先刷新页面。chrome:// 等内置页面不支持采集。',
    );
  }
}

async function runInTab(message, onProgress) {
  if (!tabId) throw new Error('没有可用的页面标签页');
  const requestId = crypto.randomUUID();
  const listener = (event) => {
    if (event?.type !== 'ext:progress' || event.requestId !== requestId) return;
    onProgress?.(event.done, event.total);
  };
  chrome.runtime.onMessage.addListener(listener);
  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { ...message, requestId });
    } catch {
      throw new Error('页面脚本未响应，请刷新页面后重试');
    }
    if (!response) throw new Error('页面没有返回结果');
    if (!response.ok) {
      const error = new Error(response.error || '操作失败');
      if (response.needsConfig) error.needsConfig = true;
      throw error;
    }
    return response.result;
  } finally {
    chrome.runtime.onMessage.removeListener(listener);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'ext:items-changed') return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refresh(), 300);
});

void init();
