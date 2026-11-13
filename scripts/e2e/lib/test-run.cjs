/* eslint-disable */
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const STORAGE_ROOT = path.join(REPO_ROOT, 'storage');
const TEST_PREFIX = '_e2e-';

const tracked = new Set();
let cleaned = false;

function assertSafeDir(dir) {
  const resolved = path.resolve(dir);
  const insideStorage = resolved.startsWith(STORAGE_ROOT + path.sep);
  const isTestDir = path.basename(resolved).startsWith(TEST_PREFIX);
  if (!insideStorage || !isTestDir) {
    throw new Error(`拒绝清理非测试目录：${resolved}`);
  }
  return resolved;
}

/**
 * 注册一个测试输出目录（storage/_e2e-*）。
 * 会先删掉同名旧目录，保证断言从干净状态开始。
 */
function trackTestOutDir(name) {
  const dir = assertSafeDir(path.join(STORAGE_ROOT, `${TEST_PREFIX}${name}`));
  tracked.add(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

/** 清理本次测试创建的目录，可重复调用 */
function cleanupTestDirs() {
  if (cleaned) return;
  cleaned = true;
  for (const dir of tracked) {
    try {
      assertSafeDir(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`CLEANUP removed ${path.relative(REPO_ROOT, dir)}`);
    } catch (error) {
      console.warn(`CLEANUP skipped ${dir}: ${error.message}`);
    }
  }
  tracked.clear();
}

/**
 * 清理历史遗留的 storage/_e2e-* 目录（只匹配测试前缀，绝不动 storage 其它内容）。
 * 放在测试启动时调用，可兜住上一次异常退出留下的目录。
 */
function cleanupStaleTestDirs() {
  if (!fs.existsSync(STORAGE_ROOT)) return;
  for (const entry of fs.readdirSync(STORAGE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEST_PREFIX)) continue;
    const dir = assertSafeDir(path.join(STORAGE_ROOT, entry.name));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`CLEANUP stale ${path.relative(REPO_ROOT, dir)}`);
  }
}

process.on('exit', cleanupTestDirs);
process.on('SIGINT', () => {
  cleanupTestDirs();
  process.exit(130);
});
process.on('uncaughtException', (error) => {
  console.error(error);
  cleanupTestDirs();
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  cleanupTestDirs();
  process.exit(1);
});

module.exports = { trackTestOutDir, cleanupTestDirs, cleanupStaleTestDirs, STORAGE_ROOT };
