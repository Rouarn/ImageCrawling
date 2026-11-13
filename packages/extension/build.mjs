import { build } from 'esbuild';
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  watch as watchFiles,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

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
  mkdirSync(path.join(dist, 'icons'), { recursive: true });
  await bundleAll({ quiet: false });
  copyStatic();
  writeIcons();
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

/* ---------------- 图标生成（纯 Node，无二进制资源入库） ---------------- */

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const margin = size * 0.22;
  const gap = size * 0.08;
  const cell = (size - margin * 2 - gap) / 2;
  const cellRadius = size * 0.07;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = null;
      if (insideRoundedRect(x, y, 0, 0, size, size, radius)) {
        color = [90, 92, 240, 255];
      }
      const cells = [
        [margin, margin],
        [margin + cell + gap, margin],
        [margin, margin + cell + gap],
        [margin + cell + gap, margin + cell + gap],
      ];
      for (const [left, top] of cells) {
        if (insideRoundedRect(x, y, left, top, cell, cell, cellRadius)) {
          color = [255, 255, 255, 255];
        }
      }
      if (!color) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(
      raw,
      y * (size * 4 + 1) + 1,
      y * size * 4,
      (y + 1) * size * 4,
    );
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x >= left + width || y >= top + height) {
    return false;
  }
  const innerLeft = left + radius;
  const innerRight = left + width - radius;
  const innerTop = top + radius;
  const innerBottom = top + height - radius;
  if (
    (x >= innerLeft && x <= innerRight) ||
    (y >= innerTop && y <= innerBottom)
  ) {
    return true;
  }
  const cx = x < innerLeft ? innerLeft : innerRight;
  const cy = y < innerTop ? innerTop : innerBottom;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function writeIcons() {
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(path.join(dist, 'icons', `icon-${size}.png`), createIcon(size));
  }
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

await initialBuild();
if (isWatch) startWatch();
