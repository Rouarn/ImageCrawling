import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { AppConfigService } from '../config/app-config.service';
import { StorageService } from '../storage/storage.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

const storageRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'image-crawling-import-controller-'),
);
const originalStorageDir = process.env.STORAGE_DIR;
const originalImportToken = process.env.IMPORT_TOKEN;
process.env.STORAGE_DIR = storageRoot;

const config = new AppConfigService();
const storage = new StorageService(config);
storage.onModuleInit();

after(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
  restore('STORAGE_DIR', originalStorageDir);
  restore('IMPORT_TOKEN', originalImportToken);
});

void test('未配置 IMPORT_TOKEN 时返回 503', () => {
  delete process.env.IMPORT_TOKEN;
  const isolated = createController();
  assert.throws(
    () => isolated.status(request('127.0.0.1'), 'any'),
    (error: unknown) =>
      error instanceof AppException && error.code === ErrorCode.IMPORT_DISABLED,
  );
});

void test('令牌缺失或不匹配时返回 401', () => {
  process.env.IMPORT_TOKEN = 'secret-token';
  const isolated = createController();
  for (const token of [undefined, '', 'wrong-token']) {
    assert.throws(
      () => isolated.status(request('127.0.0.1'), token),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === ErrorCode.IMPORT_UNAUTHORIZED,
    );
  }
  assert.deepEqual(isolated.status(request('127.0.0.1'), 'secret-token'), {
    ready: true,
    storageRoot,
  });
});

void test('非本机请求返回 403', () => {
  process.env.IMPORT_TOKEN = 'secret-token';
  const isolated = createController();
  for (const address of ['192.168.1.10', '10.0.0.2', undefined]) {
    assert.throws(
      () => isolated.status(request(address), 'secret-token'),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === ErrorCode.IMPORT_FORBIDDEN,
    );
  }
});

void test('IPv6 回环地址被接受', () => {
  process.env.IMPORT_TOKEN = 'secret-token';
  const isolated = createController();
  for (const address of ['::1', '::ffff:127.0.0.1']) {
    assert.equal(isolated.status(request(address), 'secret-token').ready, true);
  }
});

void test('主实例可以通过状态检查', () => {
  process.env.IMPORT_TOKEN = 'e2e-token';
  const isolated = createController();
  assert.equal(isolated.status(request('127.0.0.1'), 'e2e-token').ready, true);
});

function createController(): ImportController {
  return new ImportController(
    new AppConfigService(),
    storage,
    new ImportService(storage),
  );
}

function request(remoteAddress: string | undefined): Request {
  return { socket: { remoteAddress } } as unknown as Request;
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
