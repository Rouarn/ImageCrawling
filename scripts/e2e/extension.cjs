/* eslint-disable */
/**
 * 扩展端到端测试：加载 packages/extension/dist，采集 fixture 页面并存入图片库。
 *
 * 前置条件：
 *   1) 后端运行在 http://127.0.0.1:5678，且 IMPORT_TOKEN 与 E2E_IMPORT_TOKEN 一致
 *      （默认 e2e-token），例如：
 *      IMPORT_TOKEN=e2e-token PORT=5678 pnpm --filter backend start
 *   2) 已执行 pnpm extension:build
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startFixtureServer } = require('./lib/fixture-server.cjs');
const {
  trackTestOutDir,
  cleanupTestDirs,
  cleanupStaleTestDirs,
} = require('./lib/test-run.cjs');

const backendRequire = createRequire(
  path.resolve(__dirname, '../../packages/backend/package.json'),
);
const puppeteer = backendRequire('puppeteer');

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:5678';
const IMPORT_TOKEN = process.env.E2E_IMPORT_TOKEN ?? 'e2e-token';
const GROUP = '_e2e-extension';
const EXTENSION_PATH = path.resolve(__dirname, '../../packages/extension/dist');
const SHOT_DIR =
  process.env.E2E_SHOT_DIR ?? path.join(os.tmpdir(), 'image-crawling-extension');
const FIXTURE_URL = 'http://127.0.0.1:8899/extension/index.html';

/**
 * 选择可加载扩展的浏览器。
 * 正式版 Chrome 137+ 忽略 --load-extension，但可在 CDP 里用
 * Extensions.loadUnpacked（需 --enable-unsafe-extension-debugging）；
 * Edge 等 Chromium 系浏览器仍支持 --load-extension。
 */
function resolveBrowser() {
  const candidates = [
    process.env.E2E_BROWSER_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    puppeteer.executablePath(),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      '未找到可用的 Chromium 浏览器：请设置 E2E_BROWSER_PATH',
    );
  }
  return found;
}

/** 优先用 CDP 加载；失败时改用 --load-extension 重新启动浏览器 */
async function loadExtension(browser) {
  try {
    const session = await browser.target().createCDPSession();
    const result = await session.send('Extensions.loadUnpacked', {
      path: EXTENSION_PATH,
    });
    return result?.id ?? 'cdp';
  } catch {
    return null;
  }
}

function launchArgs(withCliFlags) {
  return [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-extension-debugging',
    ...(withCliFlags
      ? [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
        ]
      : []),
  ];
}

async function launchBrowser(withCliFlags) {
  return puppeteer.launch({
    headless: true,
    executablePath: resolveBrowser(),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: launchArgs(withCliFlags),
    defaultViewport: { width: 1440, height: 960 },
  });
}



const results = [];
cleanupStaleTestDirs();
const outDir = trackTestOutDir('extension');
fs.mkdirSync(SHOT_DIR, { recursive: true });

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
}

async function openPanelCount(page) {
  return page.evaluate(() => {
    const host = document.getElementById('image-crawler-host');
    return Number(host?.shadowRoot?.querySelector('[data-pill-count]')?.textContent ?? 0);
  });
}

(async () => {
  const fixture = await startFixtureServer(8899);
  // CDP 加载与 --disable-extensions-except 同时使用会让扩展不生效，
  // 所以先不带 CLI 参数启动，CDP 不可用时再带参数重启。
  let browser = await launchBrowser(false);
  let loadMode = await loadExtension(browser);
  if (!loadMode) {
    await browser.close();
    browser = await launchBrowser(true);
    loadMode = 'cli';
  }
  console.log(`BROWSER ${path.basename(resolveBrowser())} load=${loadMode}`);

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    // 先打开页面，让 content script 发消息唤醒 service worker；
    // MV3 的 service worker 是懒启动的，加载扩展后不会一直驻留。
    await page.goto(FIXTURE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const workerTarget = await browser
      .waitForTarget(
        (target) =>
          target.type() === 'service_worker' &&
          target.url().startsWith('chrome-extension://'),
        { timeout: 30000 },
      )
      .catch(async (error) => {
        console.error(
          'targets:',
          browser.targets().map((target) => `${target.type()} ${target.url()}`),
        );
        throw error;
      });
    const worker = await workerTarget.worker();
    await worker.evaluate((settings) => chrome.storage.local.set(settings), {
      backendUrl: BACKEND_URL,
      token: IMPORT_TOKEN,
    });
    check('扩展 service worker 已启动', true, `${new URL(workerTarget.url()).host}（${loadMode}）`);

    const health = await fetch(`${BACKEND_URL}/api/system/health`).then((r) =>
      r.json(),
    );
    check('后端可用', health?.success === true, BACKEND_URL);

    await page.waitForFunction(
      () => {
        const host = document.getElementById('image-crawler-host');
        const count = host?.shadowRoot?.querySelector('[data-pill-count]')?.textContent;
        return Number(count) >= 7;
      },
      { timeout: 20000 },
    );
    const total = await openPanelCount(page);
    check('采集到 fixture 图片（含增量插入）', total >= 7, `共 ${total} 张`);

    await page.evaluate(() => {
      document
        .getElementById('image-crawler-host')
        ?.shadowRoot?.querySelector('.ic-pill')
        ?.click();
    });
    await page.waitForFunction(
      () => {
        const panel = document
          .getElementById('image-crawler-host')
          ?.shadowRoot?.querySelector('.ic-panel');
        return panel && !panel.hidden;
      },
      { timeout: 5000 },
    );
    const thumbs = await page.evaluate(
      () =>
        document
          .getElementById('image-crawler-host')
          ?.shadowRoot?.querySelectorAll('.ic-thumb').length ?? 0,
    );
    check('面板网格渲染', thumbs >= 7, `thumbs=${thumbs}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'panel-normal.png') });

    // 最小尺寸筛选：photo-b 只有 682px 宽，选 ≥800 后应被过滤掉
    const filterBefore = total;
    const filterAfter = await page.evaluate(() => {
      const root = document.getElementById('image-crawler-host').shadowRoot;
      const select = root.querySelector('[data-filter="min"]');
      select.value = '800';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return root.querySelectorAll('.ic-thumb').length;
    });
    check(
      '按最小尺寸筛选生效',
      filterAfter < filterBefore && filterAfter > 0,
      `${filterBefore} → ${filterAfter}`,
    );

    await page.evaluate(() => {
      const root = document.getElementById('image-crawler-host').shadowRoot;
      const select = root.querySelector('[data-filter="min"]');
      select.value = '0';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      root.querySelector('[data-act="select-all"]').click();
      const input = root.querySelector('[data-group]');
      input.value = '_e2e-extension';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const selectedText = await page.evaluate(
      () =>
        document
          .getElementById('image-crawler-host')
          ?.shadowRoot?.querySelector('.ic-count').textContent ?? '',
    );
    check('全选后计数正确', selectedText.includes(`已选 ${total}`), selectedText);

    await page.evaluate(() => {
      document
        .getElementById('image-crawler-host')
        ?.shadowRoot?.querySelector('[data-act="save"]')
        ?.click();
    });
    await page.waitForFunction(
      () => {
        const feedback = document
          .getElementById('image-crawler-host')
          ?.shadowRoot?.querySelector('.ic-feedback');
        return feedback?.hidden === false && feedback.textContent.includes('新增 3，重复 4');
      },
      { timeout: 120000 },
    );
    await page.screenshot({ path: path.join(SHOT_DIR, 'panel-saved.png') });

    const firstFiles = fs.readdirSync(outDir);
    check('按内容去重后写入 3 个文件', firstFiles.length === 3, firstFiles.join(', '));

    const groups = await fetch(`${BACKEND_URL}/api/images/groups`).then((r) =>
      r.json(),
    );
    const group = groups?.data?.groups?.find((item) => item.key === GROUP);
    check('图片库接口能看到新分组', group?.count === 3, JSON.stringify(group));

    // 第二次保存：全部命中去重，不应新增文件
    await page.evaluate(() => {
      document
        .getElementById('image-crawler-host')
        ?.shadowRoot?.querySelector('[data-act="save"]')
        ?.click();
    });
    await page.waitForFunction(
      () => {
        const feedback = document
          .getElementById('image-crawler-host')
          ?.shadowRoot?.querySelector('.ic-feedback');
        return feedback?.textContent?.includes('已存在 7 张');
      },
      { timeout: 120000 },
    );
    const secondFiles = fs.readdirSync(outDir);
    check(
      '重复保存不新增文件',
      secondFiles.length === 3 && secondFiles.join() === firstFiles.join(),
      secondFiles.join(', '),
    );
    await page.screenshot({ path: path.join(SHOT_DIR, 'panel-duplicate.png') });

    // 弹窗入口：作为扩展页打开，再切回页面标签页，让 popup 读取当前标签页的采集结果
    const extensionHost = new URL(workerTarget.url()).host;
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extensionHost}/popup.html`);
    await page.bringToFront();
    await popup.reload({ waitUntil: 'domcontentloaded' });
    await popup.waitForFunction(
      () => {
        const root = document.getElementById('app')?.shadowRoot;
        return (root?.querySelectorAll('.ic-thumb').length ?? 0) >= 7;
      },
      { timeout: 15000 },
    );
    const popupThumbs = await popup.evaluate(
      () => document.getElementById('app').shadowRoot.querySelectorAll('.ic-thumb').length,
    );
    check('popup 显示同一份列表', popupThumbs >= 7, `thumbs=${popupThumbs}`);
    await popup.screenshot({ path: path.join(SHOT_DIR, 'popup.png') });
    await popup.close();

    await browser.close();
    const failed = results.filter((item) => !item.pass);
    console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
    console.log(`截图目录：${SHOT_DIR}`);
    if (failed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    if (consoleErrors.length > 0) {
      console.error('页面 console errors:');
      for (const message of consoleErrors) console.error(`  ${message}`);
    }
    await browser.close().catch(() => {});
    process.exitCode = 1;
  } finally {
    await fixture.close();
    cleanupTestDirs();
  }
})();
