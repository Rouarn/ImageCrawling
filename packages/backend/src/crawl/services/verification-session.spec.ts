import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VerificationError, type ChallengeState } from '../types/challenge';
import { VerificationSession } from './verification-session';

function createSession(timeoutMs = 5000) {
  const states: ChallengeState[] = [];
  const session = new VerificationSession({
    taskId: 'task-1',
    detection: { reason: 'http-403', matched: ['status:403'], status: 403 },
    verifyUrl: 'https://example.com/',
    timeoutMs,
    onStateChange: (state) => states.push(state),
  });
  return { session, states };
}

void test('pending → resolved：返回会话凭据并只通知一次', async () => {
  const { session, states } = createSession();
  const promise = session.promise;

  assert.equal(session.state, 'pending');
  assert.equal(session.resolve({ cookie: 'cf_clearance=abc' }), true);
  assert.equal(session.resolve({ cookie: 'again' }), false);

  const result = await promise;
  assert.equal(result.cookie, 'cf_clearance=abc');
  assert.equal(session.state, 'resolved');
  assert.deepEqual(states, ['resolved']);
});

void test('pending → cancelled：等待方收到取消错误', async () => {
  const { session } = createSession();
  const promise = session.promise;
  session.cancel();

  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof VerificationError);
    assert.equal(error.reason, 'cancelled');
    return true;
  });
  assert.equal(session.state, 'cancelled');
});

void test('pending → timeout：按超时结算', async () => {
  const { session, states } = createSession(10);
  await assert.rejects(session.promise, (error: unknown) => {
    assert.ok(error instanceof VerificationError);
    assert.equal(error.reason, 'timeout');
    return true;
  });
  assert.equal(session.state, 'timeout');
  assert.deepEqual(states, ['timeout']);
});

void test('pending → window-closed：窗口被手动关闭', async () => {
  const { session } = createSession();
  const promise = session.promise;
  session.markWindowClosed();

  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof VerificationError);
    assert.equal(error.reason, 'window-closed');
    return true;
  });
  assert.equal(session.state, 'window-closed');
});

void test('结算后再取消/超时都不改变最终状态', async () => {
  const { session, states } = createSession(10);
  session.resolve({ cookie: 'a=b' });
  session.cancel();
  session.markTimeout();

  await session.promise;
  assert.equal(session.state, 'resolved');
  assert.deepEqual(states, ['resolved']);
});

void test('取消后不会再被超时覆盖', async () => {
  const { session } = createSession(20);
  session.cancel();
  await assert.rejects(session.promise);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(session.state, 'cancelled');
});
