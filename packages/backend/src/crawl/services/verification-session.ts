import {
  VerificationError,
  type ChallengeDetection,
  type ChallengeState,
  type ChallengeVerification,
} from '../types/challenge';

export type VerificationStateListener = (
  state: ChallengeState,
  payload?: { verification?: ChallengeVerification; message?: string },
) => void;

export interface VerificationSessionParams {
  taskId: string;
  detection: ChallengeDetection;
  verifyUrl: string;
  timeoutMs: number;
  onStateChange?: VerificationStateListener;
}

/**
 * 一次人工验证的状态机。
 *
 * pending 只能落到 resolved / cancelled / timeout / window-closed / failed 之一，
 * 后续状态变更一律忽略，保证等待方只会被结算一次。
 */
export class VerificationSession {
  readonly taskId: string;
  readonly detection: ChallengeDetection;
  readonly verifyUrl: string;
  readonly timeoutMs: number;
  readonly startedAt = Date.now();
  readonly promise: Promise<ChallengeVerification>;

  private currentState: ChallengeState = 'pending';
  private resolvePromise!: (value: ChallengeVerification) => void;
  private rejectPromise!: (error: VerificationError) => void;
  private timer?: NodeJS.Timeout;
  private readonly listener?: VerificationStateListener;

  constructor(params: VerificationSessionParams) {
    this.taskId = params.taskId;
    this.detection = params.detection;
    this.verifyUrl = params.verifyUrl;
    this.timeoutMs = params.timeoutMs;
    this.listener = params.onStateChange;

    this.promise = new Promise<ChallengeVerification>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
    // 调用方一定会 await，这里再兜底一次，避免未处理的 rejection
    this.promise.catch(() => undefined);

    this.timer = setTimeout(() => {
      this.settle('timeout', new VerificationError('timeout', '人工验证超时'));
    }, params.timeoutMs);
    this.timer.unref?.();
  }

  get state(): ChallengeState {
    return this.currentState;
  }

  get settled(): boolean {
    return this.currentState !== 'pending';
  }

  get waitedMs(): number {
    return Date.now() - this.startedAt;
  }

  resolve(verification: ChallengeVerification): boolean {
    if (!this.beginSettle('resolved')) return false;
    this.resolvePromise(verification);
    this.listener?.('resolved', { verification });
    return true;
  }

  cancel(message = '人工验证已取消'): boolean {
    return this.settle(
      'cancelled',
      new VerificationError('cancelled', message),
    );
  }

  markTimeout(message = '人工验证超时'): boolean {
    return this.settle('timeout', new VerificationError('timeout', message));
  }

  markWindowClosed(message = '验证窗口已被关闭，未完成人机校验'): boolean {
    return this.settle(
      'window-closed',
      new VerificationError('window-closed', message),
    );
  }

  fail(message = '人工验证失败'): boolean {
    return this.settle('failed', new VerificationError('failed', message));
  }

  private settle(
    state: Exclude<ChallengeState, 'pending' | 'resolved'>,
    error: VerificationError,
  ): boolean {
    if (!this.beginSettle(state)) return false;
    this.rejectPromise(error);
    this.listener?.(state, { message: error.message });
    return true;
  }

  private beginSettle(state: ChallengeState): boolean {
    if (this.currentState !== 'pending') return false;
    this.currentState = state;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    return true;
  }
}
