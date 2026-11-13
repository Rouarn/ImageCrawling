/**
 * 人机验证流程 E2E：断言提示卡 -> 打开验证窗口 -> 任务继续并完成。
 * 前置：后端（默认 5678）已配置 girl-atlas 可用代理；前端 5173 已启动。
 * 全部基于 DOM 文本与 HTTP 响应，不使用截图；输出目录固定为 data/library/_e2e-girl-atlas，结束后自动清理。
 */
const path = require('node:path');
const { createRequire } = require('node:module');

const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const puppeteer = backendRequire('puppeteer');
const { trackTestOutDir, cleanupTestDirs, cleanupStaleTestDirs } = require('./lib/test-run.cjs');

const FRONTEND = process.env.E2E_BASE_URL ?? 'http://localhost:5173/';
const STEP = (name) => console.log(`STEP ${name}`);
const PASS = (name) => console.log(`PASS ${name}`);
const FAIL = (name, detail) => {
  console.log(`FAIL ${name}: ${detail}`);
  process.exitCode = 1;
};

cleanupStaleTestDirs();
trackTestOutDir('girl-atlas');

async function waitForText(page, text, timeout = 20000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value, { delay: 5 });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    STEP('open-frontend');
    await page.goto(FRONTEND, { waitUntil: 'networkidle2' });
    await waitForText(page, '抓取配置');
    PASS('frontend-loaded');

    STEP('select-preset');
    await page.click('.ant-select');
    await waitForText(page, 'Girl Atlas');
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.ant-select-item-option'));
      const target = items.find((el) => el.textContent.includes('Girl Atlas'));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(
      () => document.querySelector('input#url')?.value?.includes('girl-atlas'),
      { timeout: 10000 },
    );
    PASS('preset-applied');

    STEP('override-out-dir');
    await fill(page, '#outDir', '_e2e-girl-atlas');
    PASS('out-dir-overridden');

    STEP('submit');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button'))
        .find((btn) => btn.textContent.includes('开始抓取'))
        .click();
    });
    PASS('submitted');

    STEP('wait-challenge-card');
    await waitForText(page, '需要人工验证', 90000);
    PASS('challenge-card-visible');
    const cardText = await page.evaluate(() => {
      const card = document.querySelector('[role="status"]');
      return card ? card.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    console.log('DETAIL card-text:', cardText);

    STEP('open-verification-window');
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/verification') && res.request().method() === 'POST',
        { timeout: 90000 },
      ),
      page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="status"] button'))
          .find((b) => b.innerText.includes('打开验证窗口'))
          .click();
      }),
    ]);
    const body = await response.json().catch(() => ({}));
    console.log(`DETAIL open-response: ${response.status()} ${JSON.stringify(body)}`);
    if (body?.success) PASS('open-window-api');
    else FAIL('open-window-api', `HTTP ${response.status()}`);

    STEP('wait-task-end');
    const outcome = await page
      .waitForFunction(
        () => {
          const text = document.body.innerText;
          if (text.includes('抓取完成') || /\d+\s*张图片已保存/.test(text)) return 'completed';
          if (text.includes('任务失败')) return 'failed';
          if (text.includes('任务已取消')) return 'cancelled';
          return null;
        },
        { timeout: 240000, polling: 500 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => 'timeout');
    console.log(`DETAIL outcome: ${outcome}`);
    if (outcome === 'completed') PASS('task-outcome-completed');
    else FAIL('task-outcome', `结果为 ${outcome}`);

    const summary = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 800));
    console.log('DETAIL console-text:', summary);
    if (consoleErrors.length) console.log('DETAIL console-errors:', JSON.stringify(consoleErrors.slice(0, 5)));
  } catch (error) {
    FAIL('e2e', error.message);
  } finally {
    await browser.close();
    cleanupTestDirs();
  }
})();
