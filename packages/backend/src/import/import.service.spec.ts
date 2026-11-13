import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { AppConfigService } from '../config/app-config.service';
import { StorageService } from '../storage/storage.service';
import { ImportService } from './import.service';

/** 1×1 PNG，足够通过文件头识别 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF-test-image'),
]);

const storageRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'image-crawling-import-'),
);
const originalStorageDir = process.env.STORAGE_DIR;
process.env.STORAGE_DIR = storageRoot;

const config = new AppConfigService();
const storage = new StorageService(config);
storage.onModuleInit();
const service = new ImportService(storage);

after(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
  if (originalStorageDir === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = originalStorageDir;
});

void test('首次导入写入分组目录，文件名带 hash 前缀', async () => {
  const result = await service.importImage({
    group: '测试组',
    fileName: 'photo.png',
    buffer: PNG,
  });
  const [group, name] = result.path.split('/');

  assert.equal(result.saved, true);
  assert.equal(result.duplicate, false);
  assert.equal(group, '测试组');
  assert.equal(
    name.startsWith(
      createHash('sha256').update(PNG).digest('hex').slice(0, 16),
    ),
    true,
  );
  assert.equal(name.endsWith('.png'), true);
  assert.equal(fs.existsSync(path.join(storageRoot, result.path)), true);
  assert.equal(
    result.url,
    `/media/${encodeURIComponent('测试组')}/${encodeURIComponent(name)}`,
  );
});

void test('同分组同内容第二次导入只保留一份', async () => {
  const first = await service.importImage({
    group: '去重组',
    fileName: 'one.png',
    buffer: PNG,
  });
  const second = await service.importImage({
    group: '去重组',
    fileName: 'one-again.png',
    buffer: PNG,
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.saved, false);
  assert.equal(second.path, first.path);
  assert.deepEqual(fs.readdirSync(path.join(storageRoot, '去重组')), [
    first.path.split('/')[1],
  ]);
});

void test('不同分组允许保存相同内容', async () => {
  const a = await service.importImage({ group: '分组A', buffer: JPG });
  const b = await service.importImage({ group: '分组B', buffer: JPG });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, false);
  assert.notEqual(a.path, b.path);
});

void test('非图片内容被拒绝', async () => {
  await assert.rejects(
    () =>
      service.importImage({
        group: '非法内容',
        buffer: Buffer.from('<html><body>not an image</body></html>'),
      }),
    (error: unknown) =>
      error instanceof AppException &&
      error.code === ErrorCode.IMPORT_INVALID_IMAGE,
  );
});

void test('非法分组名不会写出存储目录', async () => {
  await assert.rejects(
    () => service.importImage({ group: '../逃逸', buffer: PNG }),
    (error: unknown) =>
      error instanceof AppException && error.code === ErrorCode.INVALID_OUT_DIR,
  );
});

void test('原始文件名中的路径与非法字符会被清理', async () => {
  const result = await service.importImage({
    group: '文件名清洗',
    fileName: '../../bad:name?.jpg',
    buffer: JPG,
  });
  const name = result.path.split('/')[1];
  assert.equal(result.path.startsWith('文件名清洗/'), true);
  assert.equal(name.includes('..'), false);
  assert.equal(/[:?]/.test(name), false);
  assert.equal(name.endsWith('.jpg'), true);
  assert.equal(fs.existsSync(path.join(storageRoot, '文件名清洗', name)), true);
});

void test('空请求体被拒绝', async () => {
  await assert.rejects(
    () => service.importImage({ group: '空体', buffer: Buffer.alloc(0) }),
    (error: unknown) =>
      error instanceof AppException &&
      error.code === ErrorCode.IMPORT_INVALID_IMAGE,
  );
});
