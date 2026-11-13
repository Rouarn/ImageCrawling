import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { describeFailure } from './image-downloader.service';

void test('下载失败原因：保留 HTTP 状态码', () => {
  const error = new AppException(
    ErrorCode.DOWNLOAD_FAILED,
    'HTTP 403 Forbidden',
    502,
  );
  assert.equal(describeFailure(error), 'HTTP 403 Forbidden');
});

void test('下载失败原因：暴露底层网络错误码', () => {
  const error = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ENOTFOUND' },
  });
  assert.equal(
    describeFailure(error),
    'fetch failed（ENOTFOUND，域名解析失败）',
  );
});

void test('下载失败原因：未知网络码也保留', () => {
  const error = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'UND_ERR_SOCKET' },
  });
  assert.equal(describeFailure(error), 'fetch failed（UND_ERR_SOCKET）');
});

void test('下载失败原因：超时与取消统一描述', () => {
  const error = new DOMException('aborted', 'AbortError');
  assert.equal(describeFailure(error), '请求超时或已被取消');
});
