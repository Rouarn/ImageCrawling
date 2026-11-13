import { defaultGroupName, domainSlug } from '../shared/util.js';
import { getSettings } from '../shared/settings.js';
import { downloadImages, saveImages } from './upload.js';
import { ImageCollector } from './collector.js';
import { ImagePanel } from './panel.js';

const HOST_ID = 'image-crawler-host';

let collector = null;
let panel = null;

function buildMeta() {
  const title = document.title || '';
  return {
    title,
    domain: domainSlug(location.hostname),
    pageUrl: location.href,
    groupDefault: defaultGroupName(title, location.hostname),
  };
}

function getName(url) {
  return collector?.get(url)?.name ?? '';
}

function mountHost() {
  const existing = document.getElementById(HOST_ID);
  if (existing) return null;
  const host = document.createElement('div');
  host.id = HOST_ID;
  // 只占位不拦截点击；面板与胶囊都用 fixed 定位
  host.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;';
  (document.body ?? document.documentElement).appendChild(host);
  return host;
}

function sendProgress(requestId, action, done, total) {
  if (!requestId) return;
  chrome.runtime
    .sendMessage({ type: 'ext:progress', requestId, action, done, total })
    .catch(() => {});
}

async function runInPage(message, action, work) {
  try {
    const result = await work((done, total) =>
      sendProgress(message.requestId, action, done, total),
    );
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      needsConfig: Boolean(error?.needsConfig),
    };
  }
}

const host = mountHost();
if (host) {
  collector = new ImageCollector({
    onChange: (items) => {
      panel?.setData(items, buildMeta());
      chrome.runtime
        .sendMessage({ type: 'ext:items-changed', count: items.length })
        .catch(() => {});
    },
  });

  panel = new ImagePanel({
    mode: 'overlay',
    actions: {
      async save({ urls, group, onProgress }) {
        const settings = await getSettings();
        return saveImages(urls, {
          settings,
          group,
          sourceUrl: location.href,
          getName,
          onProgress,
        });
      },
      async download({ files, onProgress }) {
        return downloadImages(files, { onProgress });
      },
      openSettings() {
        chrome.runtime
          .sendMessage({ type: 'ext:open-options' })
          .catch(() => {});
      },
    },
  });
  panel.mount(host);
  collector.start();

  // SPA 改标题 / 改地址时刷新面板头部
  let lastMeta = JSON.stringify(buildMeta());
  setInterval(() => {
    const meta = buildMeta();
    const signature = JSON.stringify(meta);
    if (signature === lastMeta) return;
    lastMeta = signature;
    panel.setData(collector.getItems(), meta);
  }, 3000);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || sender.id !== chrome.runtime.id) return;

    switch (message.type) {
      case 'ext:list':
        sendResponse({
          ok: true,
          items: collector.getItems(),
          meta: buildMeta(),
        });
        return;
      case 'ext:rescan':
        collector.fullScan();
        sendResponse({ ok: true });
        return;
      case 'ext:open-panel':
        panel.setOpen(true);
        sendResponse({ ok: true });
        return;
      case 'ext:save':
        runInPage(message, 'save', async (onProgress) => {
          const settings = await getSettings();
          return saveImages(message.urls ?? [], {
            settings,
            group: message.group,
            sourceUrl: location.href,
            getName,
            onProgress,
          });
        }).then(sendResponse);
        return true;
      case 'ext:download':
        runInPage(message, 'download', async (onProgress) =>
          downloadImages(message.files ?? [], { onProgress }),
        ).then(sendResponse);
        return true;
      default:
        return;
    }
  });
}
