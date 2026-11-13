import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ADAPTER_ID, defaultAdapter } from './default.adapter';
import { girlAtlasAdapter } from './girl-atlas.adapter';
import { AdapterRegistry } from './registry';
import { createAdapterRuntime } from './runtime';
import type { SiteAdapter } from './types';

const signal = new AbortController().signal;
const silentLog = (): void => undefined;

test('按域名命中站点适配器', () => {
  const registry = new AdapterRegistry();
  assert.equal(
    registry.resolveAdapter('https://www.girl-atlas.com/').id,
    'girl-atlas',
  );
  assert.equal(
    registry.resolveAdapter('https://girl-atlas.com/gallery').id,
    'girl-atlas',
  );
});

test('未匹配的站点回退到默认适配器，且行为不变', () => {
  const registry = new AdapterRegistry();
  const adapter = registry.resolveAdapter('https://example.com/gallery');
  assert.equal(adapter.id, DEFAULT_ADAPTER_ID);
  assert.equal(adapter, defaultAdapter);
});

test('非法 URL 回退到默认适配器', () => {
  const registry = new AdapterRegistry();
  assert.equal(registry.resolveAdapter('not a url').id, DEFAULT_ADAPTER_ID);
});

test('注册顺序决定优先级：先注册且匹配的适配器获胜', () => {
  const first: SiteAdapter = {
    id: 'first',
    label: 'first',
    description: '',
    matches: () => true,
  };
  const second: SiteAdapter = {
    id: 'second',
    label: 'second',
    description: '',
    matches: () => true,
  };
  const registry = new AdapterRegistry([first, second, defaultAdapter]);
  assert.equal(registry.resolveAdapter('https://example.com').id, 'first');
});

test('预设列表契约：字段齐全且不暴露默认适配器', () => {
  const list = new AdapterRegistry().list();
  assert.ok(list.length >= 1);
  assert.ok(list.every((item) => item.id !== DEFAULT_ADAPTER_ID));

  const preset = list.find((item) => item.id === 'girl-atlas');
  assert.ok(preset);
  assert.equal(preset.entryUrl, 'https://www.girl-atlas.com/');
  assert.ok(preset.requires.length > 0);
  assert.ok(preset.notes.length > 0);
  assert.equal(preset.options?.useHeadless, true);
});

test('默认适配器运行时与原有行为一致：入口不变、无附加请求头', async () => {
  const runtime = await createAdapterRuntime({
    adapter: defaultAdapter,
    url: 'https://example.com/gallery',
    timeoutMs: 1000,
    config: { get: () => undefined },
    log: silentLog,
    signal,
  });

  assert.equal(runtime.id, DEFAULT_ADAPTER_ID);
  assert.equal(runtime.entryUrl, 'https://example.com/gallery');
  assert.deepEqual(runtime.headers, {});
  assert.deepEqual(runtime.clickSelectors, []);
  assert.equal(runtime.scroll, undefined);
  assert.equal(runtime.proxyUrl, undefined);
  assert.equal(runtime.allowHttpErrors, false);
  assert.deepEqual(runtime.notes, []);
});

test('girl-atlas：入口改写、代理与 Cookie 均来自配置', async () => {
  const runtime = await createAdapterRuntime({
    adapter: girlAtlasAdapter,
    url: 'https://girl-atlas.com/gallery/',
    timeoutMs: 1000,
    config: {
      get: (key) => {
        if (key === 'GIRL_ATLAS_PROXY') return 'http://127.0.0.1:7897';
        if (key === 'GIRL_ATLAS_COOKIE') return 'session=abc';
        return undefined;
      },
    },
    log: silentLog,
    signal,
  });

  assert.equal(runtime.id, 'girl-atlas');
  assert.equal(runtime.entryUrl, 'https://www.girl-atlas.com/gallery/');
  assert.equal(runtime.proxyUrl, 'http://127.0.0.1:7897');
  assert.equal(runtime.headers.cookie, 'session=abc');
  assert.equal(runtime.waitForSelector?.includes('main'), true);
  assert.ok(runtime.clickSelectors.length > 0);
  assert.equal(runtime.scroll?.mode, 'page');
  assert.equal(runtime.allowHttpErrors, true);
  assert.equal(
    runtime.imageHeaders?.(
      'https://cdn.example.com/a.jpg',
      'https://www.girl-atlas.com/gallery/1',
    ).referer,
    'https://www.girl-atlas.com/gallery/1',
  );
});

test('girl-atlas：缺少代理时给出可读提示', async () => {
  const runtime = await createAdapterRuntime({
    adapter: girlAtlasAdapter,
    url: 'https://www.girl-atlas.com/',
    timeoutMs: 1000,
    config: { get: () => undefined },
    log: silentLog,
    signal,
  });

  assert.equal(runtime.proxyUrl, undefined);
  assert.ok(runtime.notes.some((note) => note.includes('未配置代理')));
});

test('girl-atlas：分页规则从页面解析下一页', () => {
  const html =
    '<html><head><link rel="next" href="/page/2/"></head><body></body></html>';
  assert.equal(
    girlAtlasAdapter.pagination?.nextPageUrl?.(
      html,
      'https://www.girl-atlas.com/gallery/',
    ),
    'https://www.girl-atlas.com/page/2/',
  );
  assert.equal(
    girlAtlasAdapter.pagination?.nextPageUrl?.(
      '<html></html>',
      'https://www.girl-atlas.com/a/',
    ),
    null,
  );
});
