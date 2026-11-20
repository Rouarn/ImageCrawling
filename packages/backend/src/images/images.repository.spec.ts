import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { IMAGE_EXTENSIONS } from '../common/utils/image-signature.util';
import type { AppConfigService } from '../config/app-config.service';
import { StorageService } from '../storage/storage.service';
import { ImagesRepository } from './images.repository';

const createdRoots: string[] = [];

after(() => {
  for (const root of createdRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createRepository(): { repository: ImagesRepository; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'images-spec-'));
  createdRoots.push(root);
  const storage = new StorageService({
    storageRoot: root,
  } as AppConfigService);
  return { repository: new ImagesRepository(storage), root };
}

void test('分组查询：历史目录（含空格、括号、保留名）仍正常列出', async () => {
  const { repository, root } = createRepository();
  const legacyDirectories = ['旧 目录（2019）', 'CON', '漫画 · 合集'];
  for (const directory of legacyDirectories) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, directory, 'photo.png'), 'png');
  }
  fs.writeFileSync(path.join(root, 'root.png'), 'png');

  const groups = await repository.listGroups();
  const keys = groups.map((group) => group.key);

  assert.ok(keys.includes('root'));
  for (const directory of legacyDirectories) {
    assert.ok(keys.includes(directory), `应包含历史分组：${directory}`);
  }

  const nested = groups.find((group) => group.key === 'CON');
  assert.equal(nested?.count, 1);
});

void test('列表识别范围覆盖下载侧可写入的全部扩展名', async () => {
  const { repository, root } = createRepository();
  const names = IMAGE_EXTENSIONS.map((extension) => `photo.${extension}`);
  for (const name of names) {
    fs.writeFileSync(path.join(root, name), 'placeholder');
  }
  // 非图片文件不应出现在图片库里，避免把列表条件放宽成「什么都收」
  fs.writeFileSync(path.join(root, 'notes.txt'), 'placeholder');

  const { items } = await repository.list({
    group: 'all',
    page: 1,
    pageSize: 100,
    sort: 'name',
  });

  assert.deepEqual(items.map((item) => item.name).sort(), [...names].sort());
});
