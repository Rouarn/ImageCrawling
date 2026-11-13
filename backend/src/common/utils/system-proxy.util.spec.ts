import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMacSystemProxy } from './system-proxy.util';

const FULL = `<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
  }
  HTTPEnable : 1
  HTTPPort : 7897
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7897
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7897
  SOCKSProxy : 127.0.0.1
}`;

void test('系统代理：优先 HTTPS', () => {
  assert.equal(parseMacSystemProxy(FULL), 'http://127.0.0.1:7897');
});

void test('系统代理：HTTPS 关闭时回退 HTTP', () => {
  const output = FULL.replace('HTTPSEnable : 1', 'HTTPSEnable : 0');
  assert.equal(parseMacSystemProxy(output), 'http://127.0.0.1:7897');
});

void test('系统代理：只有 SOCKS 时使用 socks5', () => {
  const output = `<dictionary> {
    HTTPEnable : 0
    HTTPSEnable : 0
    SOCKSEnable : 1
    SOCKSPort : 1080
    SOCKSProxy : 10.0.0.2
  }`;
  assert.equal(parseMacSystemProxy(output), 'socks5://10.0.0.2:1080');
});

void test('系统代理：未启用返回 undefined', () => {
  assert.equal(
    parseMacSystemProxy(`<dictionary> {\n  HTTPEnable : 0\n}`),
    undefined,
  );
  assert.equal(parseMacSystemProxy(''), undefined);
});

void test('系统代理：缺少 host/port 时不猜测', () => {
  const output = `<dictionary> {
    HTTPSEnable : 1
  }`;
  assert.equal(parseMacSystemProxy(output), undefined);
});
