import { build } from 'esbuild';
import { copyFileSync, cpSync, rmSync, watch as watchFiles, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DARK_TOKENS,
  LIGHT_TOKENS,
  tokenDeclarations,
} from './src/shared/theme.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const isWatch = process.argv.includes('--watch');

const entries = [
  { in: path.join(src, 'content/index.js'), out: path.join(dist, 'content.js') },
  {
    in: path.join(src, 'background/index.js'),
    out: path.join(dist, 'background.js'),
  },
  { in: path.join(src, 'popup/popup.js'), out: path.join(dist, 'popup.js') },
  { in: path.join(src, 'options/options.js'), out: path.join(dist, 'options.js') },
];

const staticFiles = ['manifest.json', 'popup/popup.html', 'options/options.html'];
// 图标取自 VaKao 品牌资源包的 icons/extensions（与 favicon-纸 同源），构建只做拷贝，不生成、不改绘
const staticDirs = [{ from: path.join(src, 'icons'), to: path.join(dist, 'icons') }];

function log(message) {
  console.log(message);
}

async function bundleAll({ quiet }) {
  for (const entry of entries) {
    await build({
      entryPoints: [entry.in],
      outfile: entry.out,
      bundle: true,
      format: 'iife',
      target: 'chrome110',
      platform: 'browser',
      logLevel: quiet ? 'silent' : 'info',
      sourcemap: false,
      define: { 'process.env.NODE_ENV': '"production"' },
    });
  }
}

function copyStatic() {
  for (const file of staticFiles) {
    copyFileSync(path.join(src, file), path.join(dist, path.basename(file)));
  }
  for (const dir of staticDirs) {
    cpSync(dir.from, dir.to, { recursive: true });
  }
}

/** 从 theme.js 生成全局主题样式，popup / options 直接引用 */
function writeThemeCss() {
  const css = `/* 由 build.mjs 从 src/shared/theme.js 生成，请勿手改 */
:root {
${tokenDeclarations(LIGHT_TOKENS)}
}
:root[data-theme="dark"] {
${tokenDeclarations(DARK_TOKENS)}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${tokenDeclarations(DARK_TOKENS)}
  }
}
`;
  writeFileSync(path.join(dist, 'theme.css'), css);
}

/**
 * esbuild 的 BuildFailure 带 errors 数组，逐条打印文件、行列和出错行；
 * 其他异常退化为 message，保证 watch 下报错可读且不中断。
 */
function formatBuildError(error) {
  if (Array.isArray(error?.errors) && error.errors.length > 0) {
    return error.errors
      .map((item) => {
        const location = item.location;
        const where = location?.file
          ? `${path.relative(root, location.file)}:${location.line}:${location.column}`
          : '构建配置';
        const lines = [`${where}: ${item.text}`];
        if (location?.lineText) {
          lines.push(`    ${location.lineText}`);
          const caret = ' '.repeat(location.column ?? 0);
          lines.push(`    ${caret}^`);
        }
        return lines.join('\n');
      })
      .join('\n');
  }
  return error?.stack || error?.message || String(error);
}

function relativeFiles(files) {
  return [...files]
    .map((file) => path.relative(src, file))
    .sort()
    .join(', ');
}

async function initialBuild() {
  rmSync(dist, { recursive: true, force: true });
  await bundleAll({ quiet: false });
  copyStatic();
  writeThemeCss();
  log(`\n扩展已构建: ${path.relative(process.cwd(), dist)}`);
  log('在 chrome://extensions 中「加载已解压的扩展程序」，选择该目录。');
}

/* ---------------- watch ---------------- */

const DEBOUNCE_MS = 120;

function startWatch() {
  const changed = new Set();
  let timer = null;
  let building = false;
  let pending = false;

  async function rebuild() {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    const files = changed.size > 0 ? relativeFiles(changed) : '（未识别的变更）';
    changed.clear();
    const startedAt = Date.now();
    try {
      await bundleAll({ quiet: true });
      copyStatic();
      writeThemeCss();
      log(`[watch] ${files} → 重建完成（${Date.now() - startedAt}ms）`);
    } catch (error) {
      log(`[watch] 构建失败（继续监听，修复后自动重建）：\n${formatBuildError(error)}`);
    } finally {
      building = false;
      if (pending) {
        pending = false;
        void rebuild();
      }
    }
  }

  const watcher = watchFiles(src, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const name = filename.toString();
    if (name.startsWith('..') || path.basename(name) === '.DS_Store') return;
    changed.add(path.join(src, name));
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), DEBOUNCE_MS);
  });

  const stop = (signal) => {
    clearTimeout(timer);
    watcher.close();
    log(`\n[watch] 收到 ${signal}，已停止监听。`);
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  log(`[watch] 监听 ${path.relative(process.cwd(), src)}，Ctrl+C 退出。`);
  log('[watch] 重建后需到 chrome://extensions 点扩展的刷新按钮，并刷新已打开的页面。');
}

await initialBuild();
if (isWatch) startWatch();
