/* eslint-disable */
const path = require('node:path');
const { createRequire } = require('node:module');

const backendRequire = createRequire(path.resolve(__dirname, '../../packages/backend/package.json'));
const puppeteer = backendRequire('puppeteer');
const { cleanupStaleTestDirs } = require('./lib/test-run.cjs');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
cleanupStaleTestDirs();

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
(async () => {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.includes('抓取配置'), { timeout: 20000 });

  // 打开站点预设下拉
  const selector = await page.$('.ant-select');
  check('站点预设下拉存在', Boolean(selector));
  await selector.click();
  await sleep(500);
  const options = await page.$$eval('.ant-select-item-option', (nodes) =>
    nodes.map((n) => n.innerText.trim()),
  );
  check('预设包含 Girl Atlas', options.some((o) => o.includes('Girl Atlas')), options.join(','));

  // 选中 Girl Atlas
  await page.evaluate(() => {
    const option = [...document.querySelectorAll('.ant-select-item-option')].find((n) =>
      n.innerText.includes('Girl Atlas'),
    );
    option?.click();
  });
  await sleep(800);

  const url = await page.$eval('#url', (el) => el.value);
  check('选中预设自动填入入口 URL', url === 'https://www.girl-atlas.com/', `url=${url}`);

  const outDir = await page.$eval('#outDir', (el) => el.value);
  check('输出目录随预设推导', outDir.length > 0, `outDir=${outDir}`);

  const maxPages = await page.$eval('#maxPages', (el) => el.value);
  check('最大页数采用预设建议', maxPages === '3', `maxPages=${maxPages}`);

  const bodyText = await page.evaluate(() => document.body.innerText);
  check('展示预设所需条件', bodyText.includes('代理') && bodyText.includes('Cloudflare'));
  check('提示 Cookie 注入方式', bodyText.includes('GIRL_ATLAS_COOKIE'));

  const headlessOn = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.ant-form-item')].find((n) =>
      n.innerText.includes('无头浏览器'),
    );
    const input = item?.querySelector('button[role="switch"]');
    return input?.getAttribute('aria-checked');
  });
  check('无头模式被自动开启', headlessOn === 'true', `aria-checked=${headlessOn}`);

  // 清空预设后恢复通用模式
  const selectBox = await page.$('.ant-select');
  await selectBox.hover();
  await sleep(300);
  const clearButton = await page.$('.ant-select-clear');
  check('预设可清除', Boolean(clearButton));
  if (clearButton) await clearButton.click();
  await sleep(600);
  const alertGone = await page.evaluate(() => !document.body.innerText.includes('GIRL_ATLAS_COOKIE'));
  check('清除预设后提示消失', alertGone);

  check('无控制台错误', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log(`\nSUMMARY: ${results.filter((r) => r.pass).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
})().catch(async (e) => {
  console.error('ERR', e);
  await browser?.close().catch(() => {});
  process.exit(1);
});
