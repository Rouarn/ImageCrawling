import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import type { AppConfigService } from '../config/app-config.service';
import { AppException } from '../common/errors/app.exception';
import { StorageService } from './storage.service';

const createdRoots: string[] = [];

after(() => {
  for (const root of createdRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createService(): { service: StorageService; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-spec-'));
  createdRoots.push(root);
  const service = new StorageService({ storageRoot: root } as AppConfigService);
  return { service, root };
}

function expectInvalid(
  service: StorageService,
  input: string,
  ...expected: string[]
): AppException {
  let caught: unknown;
  try {
    service.resolveDirectory(input);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof AppException, `应拒绝：${JSON.stringify(input)}`);
  const message = caught.message;
  for (const fragment of expected) {
    assert.ok(
      message.includes(fragment),
      `错误信息应包含「${fragment}」，实际为：${message}`,
    );
  }
  assert.ok(
    message.includes('可用示例'),
    `错误信息应给出可用示例，实际为：${message}`,
  );
  return caught;
}

void test('合法命名：空格、括号、中文标点、书名号、emoji 与非结尾点', () => {
  const { service, root } = createService();

  const nested = service.resolveDirectory(
    '画廊 2024（精选）/插画 · 合集 — 第一辑 🎨',
  );
  assert.equal(
    nested,
    path.join(root, '画廊 2024（精选）', '插画 · 合集 — 第一辑 🎨'),
  );
  assert.ok(fs.statSync(nested).isDirectory());

  const withDot = service.resolveDirectory('v1.2 版本');
  assert.ok(fs.statSync(withDot).isDirectory());

  const punctuation = service.resolveDirectory('《合集》：上、下');
  assert.ok(fs.statSync(punctuation).isDirectory());

  const spaces = service.resolveDirectory('带有 空格 的目录');
  assert.ok(fs.statSync(spaces).isDirectory());
});

void test('合法命名：空字符串以外仍保留默认层级语义', () => {
  const { service } = createService();
  assert.throws(
    () => service.resolveDirectory(''),
    (error: unknown) =>
      error instanceof AppException && error.message.includes('不能为空'),
  );
});

void test('NFC 规范化：NFD 输入落盘为 NFC 目录', () => {
  const { service, root } = createService();
  const nfd = 'cafe\u0301';
  const nfc = nfd.normalize('NFC');
  assert.notEqual(nfd, nfc);

  const absolute = service.resolveDirectory(nfd);
  assert.equal(absolute, path.join(root, nfc));
  assert.deepEqual(fs.readdirSync(root), [nfc]);
});

void test('历史目录不被改名：已存在的 NFD 目录按原样复用', () => {
  const { service, root } = createService();
  const nfd = 're\u0301sume\u0301s';
  const legacy = path.join(root, nfd);
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'marker.txt'), 'legacy');

  // macOS 的文件系统本身对 NFD/NFC 不敏感，这里只断言「复用同一目录、不产生第二个」
  const absolute = service.resolveDirectory(nfd.normalize('NFC'));
  assert.ok(fs.existsSync(path.join(absolute, 'marker.txt')));
  assert.equal(fs.readdirSync(root).length, 1);
});

void test('非法命名：空段、. 与 ..', () => {
  const { service } = createService();
  expectInvalid(service, 'a//b', '第 2 段', '为空');
  expectInvalid(service, '..', '第 1 段', '不能用 . 或 ..');
  expectInvalid(service, '画廊/../其它', '第 2 段', '不能用 . 或 ..');
});

void test('非法命名：绝对路径与反斜杠', () => {
  const { service } = createService();
  expectInvalid(service, '/绝对/路径', '绝对路径');
  expectInvalid(service, 'C:/users/images', '绝对路径');
  expectInvalid(service, '画廊\\子目录', '第 1 段', '反斜杠');
});

void test('非法命名：Windows 保留名（含带扩展名）', () => {
  const { service } = createService();
  for (const name of [
    'CON',
    'con.txt',
    'PRN',
    'aux.log',
    'NUL',
    'COM1',
    'lpt9.tar.gz',
  ]) {
    expectInvalid(service, name, 'Windows 保留名');
  }
  expectInvalid(service, '画廊/CON', '第 2 段', 'Windows 保留名');
});

void test('非法命名：段首/段尾的空格与点', () => {
  const { service } = createService();
  expectInvalid(service, ' leading', '第 1 段', '以空格开头');
  expectInvalid(service, 'trailing ', '第 1 段', '以空格结尾');
  expectInvalid(service, '.hidden', '第 1 段', '以点开头');
  expectInvalid(service, 'ending.', '第 1 段', '以点结尾');
  expectInvalid(service, '画廊 /子目录', '第 1 段', '以空格结尾');
});

void test('非法命名：控制字符（含 NUL）', () => {
  const { service } = createService();
  expectInvalid(service, 'a\u0000b', '第 1 段', '控制字符');
  expectInvalid(service, 'a\u0007b', '第 1 段', '控制字符');
  expectInvalid(service, '画廊\u007f', '第 1 段', '控制字符');
});

void test('非法命名：单段与总路径超长（UTF-8 字节）', () => {
  const { service } = createService();
  expectInvalid(service, 'a'.repeat(256), '第 1 段', '过长', '255 字节');
  expectInvalid(service, '名'.repeat(86), '第 1 段', '过长', '258 字节');

  const longPath = Array.from({ length: 6 }, () => 'a'.repeat(200)).join('/');
  expectInvalid(service, longPath, '整体过长', '1024 字节');
});

void test('非法输入不会在存储目录落盘', () => {
  const { service, root } = createService();
  expectInvalid(service, '画廊/..', '不能用 . 或 ..');
  assert.deepEqual(fs.readdirSync(root), []);
});
