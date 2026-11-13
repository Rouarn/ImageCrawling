/* eslint-disable */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

// puppeteer 是后端依赖，这里复用，避免在根目录重复安装
const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const puppeteer = backendRequire('puppeteer');
const { startFixtureServer } = require('./lib/fixture-server.cjs');
const { trackTestOutDir, cleanupTestDirs, cleanupStaleTestDirs } = require('./lib/test-run.cjs');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const results = [];

// 测试输出目录固定为 storage/_e2e-*，结束时统一清理
cleanupStaleTestDirs();
trackTestOutDir('ui');
trackTestOutDir('ui-error');

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function textOf(page, selector) {
  return page.$eval(selector, (el) => el.innerText).catch(() => '');
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector, { clickCount: 3 });
  if (!value) {
    await page.keyboard.press('Backspace');
    return;
  }
  await page.type(selector, value, { delay: 5 });
}

async function cardTitles(page) {
  return page.$$eval('figure figcaption div[title]', (nodes) =>
    nodes.map((node) => node.getAttribute('title') || ''),
  );
}

(async () => {
  const fixture = await startFixtureServer(8899);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  await browser
    .defaultBrowserContext()
    .overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction(
      () => document.body.innerText.includes('抓取配置'),
      { timeout: 20000 },
    );
    check('首页渲染', true, await page.title());
    check(
      '侧边栏导航存在',
      (await page.$$('aside nav a')).length >= 2,
      `links=${(await page.$$('aside nav a')).length}`,
    );

    // ---- 成功抓取 ----
    await fill(page, '#url', 'https://www.example.com/gallery/album-1?page=2&from=list');
    const derivedFromUrl = await page.$eval('#outDir', (el) => el.value);
    check('输入 URL 自动填充目录', derivedFromUrl === 'album-1', `value=${derivedFromUrl}`);

    await fill(page, '#url', 'https://example.com/con');
    const reservedSafe = await page.$eval('#outDir', (el) => el.value);
    check('推导结果避开 Windows 保留名', reservedSafe === 'con-site', `value=${reservedSafe}`);

    await fill(page, '#url', 'http://127.0.0.1:8899/index.html');
    const derived = await page.$eval('#outDir', (el) => el.value);
    check('输出目录自动推导', derived === 'index', `value=${derived}`);
    await fill(page, '#outDir', '_e2e-ui');
    await fill(page, '#url', 'http://127.0.0.1:8899/index.html');
    const keptOutDir = await page.$eval('#outDir', (el) => el.value);
    check('手动改写的目录不被 URL 覆盖', keptOutDir === '_e2e-ui', `value=${keptOutDir}`);

    await fill(page, '#outDir', '');
    await fill(page, '#url', 'http://127.0.0.1:8899/index.html');
    const resumed = await page.$eval('#outDir', (el) => el.value);
    check('清空目录后恢复自动填充', resumed === 'index', `value=${resumed}`);
    await fill(page, '#outDir', '_e2e-ui');
    await fill(page, '#maxPages', '3');
    await page.click('button[type="submit"]');

    await page.waitForFunction(
      () => document.body.innerText.includes('张图片已保存'),
      { timeout: 90000 },
    );
    await sleep(600);

    const toastText = await page
      .waitForFunction(
        () => {
          const nodes = [
            ...document.querySelectorAll('.ant-message-notice-content'),
          ];
          return (
            nodes.map((node) => node.innerText).find((text) => text.includes('抓取完成')) ||
            false
          );
        },
        { timeout: 5000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => '');
    check(
      '完成提示显示总数',
      toastText.includes('成功 3 张') && toastText.includes('失败 0 张'),
      `toast=${JSON.stringify(toastText)}`,
    );

    const consoleText = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('section')].find((node) =>
        node.innerText.includes('任务控制台'),
      );
      return panel ? panel.innerText : '';
    });
    const savedMatch = consoleText.match(/(\d+)\s*张图片已保存/);
    const savedCount = savedMatch ? Number(savedMatch[1]) : 0;
    check('抓取完成并保存图片', savedCount > 0, `saved=${savedCount}`);
    check('日志包含分页规划', consoleText.includes('分页规划完成'));
    check('日志包含发现数量', consoleText.includes('共发现'));
    check('日志包含下载开始', consoleText.includes('开始下载'));
    check('日志包含完成汇总', consoleText.includes('任务完成'));
    check('状态徽标为已完成', consoleText.includes('已完成'));

    // ---- 复制全部日志（取 store 全量，而不是视口内的 DOM） ----
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.innerText.includes('复制全部'),
      );
      button?.click();
    });
    await sleep(400);
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    check(
      '一键复制全部日志',
      /^\[\d{2}:\d{2}:\d{2}\] INFO /m.test(clipboardText) &&
        clipboardText.includes('任务完成') &&
        clipboardText.split('\n').length >= 10,
      `lines=${clipboardText.split('\n').length}`,
    );

    // ---- 跳转图片库 ----
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.innerText.includes('查看图片库'),
      );
      button?.click();
    });
    await page.waitForFunction(() => location.pathname === '/library', {
      timeout: 10000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.ant-image').length > 0,
      { timeout: 20000 },
    );
    const initialCards = (await page.$$('.ant-image')).length;
    check('图片库展示图片卡片', initialCards > 0, `cards=${initialCards}`);

    // ---- 分组筛选 ----
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('[role="tab"]')].find((node) =>
        node.innerText.includes('_e2e-ui'),
      );
      chip?.click();
    });
    await page.waitForFunction(
      () => location.search.includes('group=_e2e-ui'),
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => {
        const count = document.querySelectorAll('.ant-image').length;
        return count > 0 && count < 10;
      },
      { timeout: 10000 },
    );
    const groupCards = (await page.$$('.ant-image')).length;
    check('分组筛选生效', groupCards > 0 && groupCards < 10, `cards=${groupCards}`);

    // ---- 预览 ----
    await page.click('.ant-image img');
    await page.waitForSelector('.ant-image-preview-img', {
      visible: true,
      timeout: 10000,
    });
    await sleep(400);
    const naturalWidth = await page.$eval(
      '.ant-image-preview-img',
      (img) => img.naturalWidth,
    );
    check('大图预览加载', naturalWidth > 0, `naturalWidth=${naturalWidth}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('.ant-image-preview-img'),
      { timeout: 10000 },
    );

    // ---- 单张删除 ----
    const beforeDelete = (await page.$$('.ant-image')).length;
    await page.hover('figure');
    await page.click('button[aria-label^="删除 "]');
    await page.waitForSelector('.ant-modal-confirm', { visible: true, timeout: 10000 });
    await page.click('.ant-modal-confirm-btns .ant-btn-primary');
    await page.waitForFunction(
      () => document.body.innerText.includes('已删除'),
      { timeout: 15000 },
    );
    await sleep(800);
    const afterDelete = (await page.$$('.ant-image')).length;
    check(
      '单张删除成功',
      afterDelete === beforeDelete - 1,
      `${beforeDelete} -> ${afterDelete}`,
    );

    // ---- 搜索 ----
    const titlesBefore = await cardTitles(page);
    const needle = (titlesBefore[0] || '').slice(0, 8).toLowerCase();
    await fill(page, 'input[aria-label="按文件名搜索"]', needle);
    await page.waitForFunction(
      (value) => location.search.includes(`q=${encodeURIComponent(value)}`),
      { timeout: 10000 },
      needle,
    );
    await sleep(800);
    const titlesFiltered = await cardTitles(page);
    check(
      '文件名搜索生效',
      titlesFiltered.length > 0 &&
        titlesFiltered.every((title) => title.toLowerCase().includes(needle)),
      `needle=${needle}, cards=${titlesFiltered.length}`,
    );
    await fill(page, 'input[aria-label="按文件名搜索"]', '');
    await sleep(900);

    // ---- 多选批量删除 ----
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.innerText.trim() === '选择',
      );
      button?.click();
    });
    await page.waitForFunction(
      () => document.body.innerText.includes('退出选择'),
      { timeout: 5000 },
    );
    await page.click('figure .absolute.inset-0.z-10');
    await page.waitForFunction(
      () => document.body.innerText.includes('已选择'),
      { timeout: 5000 },
    );
    const beforeBatch = (await page.$$('.ant-image')).length;
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.innerText.includes('删除所选'),
      );
      button?.click();
    });
    await page.waitForSelector('.ant-modal-confirm', { visible: true, timeout: 10000 });
    await page.click('.ant-modal-confirm-btns .ant-btn-primary');
    await page.waitForFunction(
      () => !document.body.innerText.includes('已选择'),
      { timeout: 15000 },
    );
    await sleep(800);
    const afterBatch = (await page.$$('.ant-image')).length;
    check(
      '批量删除成功',
      afterBatch === beforeBatch - 1,
      `${beforeBatch} -> ${afterBatch}`,
    );
    const selectModeOff = !(await bodyText(page)).includes('退出选择');
    check('批量删除后退出选择模式', selectModeOff);

    // ---- 深色模式 ----
    const wasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    await page.click('aside button[aria-label^="切换到"]');
    await page.waitForFunction(
      (previous) =>
        document.documentElement.classList.contains('dark') !== previous,
      { timeout: 5000 },
      wasDark,
    );
    check('主题切换生效', true, wasDark ? 'dark -> light' : 'light -> dark');
    await page.click('aside button[aria-label^="切换到"]');
    const restored = await page.evaluate(
      (previous) =>
        document.documentElement.classList.contains('dark') === previous,
      wasDark,
    );
    check('主题切回原状态', restored);

    // ---- 错误路径 ----
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.innerText.includes('抓取配置'));
    await fill(page, '#url', 'http://127.0.0.1:8899/missing-page.html');
    await fill(page, '#outDir', '_e2e-ui-error');
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () => document.body.innerText.includes('任务失败'),
      { timeout: 30000 },
    );
    const errorText = await bodyText(page);
    check(
      '抓取失败错误提示',
      errorText.includes('PAGE_FETCH_FAILED') && errorText.includes('页面请求失败'),
      'PAGE_FETCH_FAILED shown',
    );
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.innerText.trim() === '清空',
      );
      button?.click();
    });
    await sleep(300);
    check('任务控制台可清空', (await bodyText(page)).includes('等待新的抓取任务'));

    // ---- 移动端 ----
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/library`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.innerText.includes('图片库'));
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    check(
      '移动端图片库无横向溢出',
      overflow.scrollWidth <= overflow.innerWidth + 1,
      JSON.stringify(overflow),
    );
    const tabBarVisible = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="移动端导航"]');
      if (!nav) return false;
      const rect = nav.getBoundingClientRect();
      return rect.height > 0 && rect.bottom <= window.innerHeight + 1;
    });
    check('移动端底部导航可见', tabBarVisible);

    await page.evaluate(() => {
      const link = [...document.querySelectorAll('nav[aria-label="移动端导航"] a')].find(
        (node) => node.innerText.includes('抓取任务'),
      );
      link?.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('抓取配置'), {
      timeout: 10000,
    });
    const crawlOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    check(
      '移动端抓取页无横向溢出',
      crawlOverflow.scrollWidth <= crawlOverflow.innerWidth + 1,
      JSON.stringify(crawlOverflow),
    );
    const mobileFormWidth = await page.$eval('form', (el) => el.getBoundingClientRect().width);
    check('移动端表单可用', mobileFormWidth > 250, `width=${Math.round(mobileFormWidth)}`);

    const appErrors = consoleErrors.filter(
      (text) => !text.includes('Download the React DevTools'),
    );
    check('无运行时控制台错误', appErrors.length === 0, appErrors.slice(0, 3).join(' || '));
  } catch (error) {
    check('E2E 执行异常', false, error && error.stack ? error.stack.split('\n')[0] : String(error));
    console.log(error);
  } finally {
    await browser.close();
    await fixture.close();
    cleanupTestDirs();
    fs.writeFileSync(
      path.join(os.tmpdir(), 'image-crawler-e2e.json'),
      JSON.stringify(results, null, 2),
    );
    const failed = results.filter((item) => !item.pass);
    console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length === 0 ? 0 : 1);
  }
})();
