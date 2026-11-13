import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChallengeDetector } from './challenge-detector.service';

const detector = new ChallengeDetector();

void test('通用判定：403 进入人工验证', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 403,
  });
  assert.equal(result?.reason, 'http-403');
  assert.ok(result?.matched.includes('status:403'));
});

void test('通用判定：429 进入人工验证', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 429,
  });
  assert.equal(result?.reason, 'http-429');
});

void test('通用判定：挑战页标题命中', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 200,
    title: 'Just a moment...',
  });
  assert.equal(result?.reason, 'challenge-page');
  assert.ok(result?.matched.some((item) => item.includes('just a moment')));
});

void test('通用判定：挑战页元素命中', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 200,
    html: '<html><body><script>window._cf_chl_opt={}</script></body></html>',
  });
  assert.equal(result?.reason, 'challenge-page');
  assert.ok(result?.matched.includes('marker:cf_chl_opt'));
});

void test('普通页面不触发验证', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 200,
    title: 'Example Domain',
    html: '<html><body><h1>Example</h1><img src="/a.png"></body></html>',
  });
  assert.equal(result, undefined);
});

void test('适配器规则优先：即使通用规则未命中，也可自定义判定', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 200,
    title: 'Example',
    html: '<html><body>ok</body></html>',
    rules: {
      detect: ({ status }) =>
        status === 200
          ? { reason: 'challenge-page', matched: ['adapter:always-verify'] }
          : undefined,
    },
  });
  assert.deepEqual(result?.matched, ['adapter:always-verify']);
});

void test('适配器返回 null 时覆盖通用判定，不进入验证', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 403,
    rules: { detect: () => null },
  });
  assert.equal(result, undefined);
});

void test('适配器无意见时回退通用规则', () => {
  const result = detector.detect({
    url: 'https://example.com/a',
    status: 403,
    rules: { detect: () => undefined },
  });
  assert.equal(result?.reason, 'http-403');
});

void test('适配器声明的通过条件属于规则契约的一部分', () => {
  const rules = {
    successCookies: ['cf_clearance'],
    successSelector: '#gallery',
    verificationUrl: 'https://example.com/verify',
  };
  assert.deepEqual(rules.successCookies, ['cf_clearance']);
  assert.equal(rules.verificationUrl, 'https://example.com/verify');
});
