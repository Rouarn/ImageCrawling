/**
 * 人机校验（挑战页）相关的通用类型。
 *
 * 通用层负责判定与挂起等待；站点差异通过适配器的 challenge 规则注入。
 */

export type ChallengeReason = 'http-403' | 'http-429' | 'challenge-page';

/** 判定依据，前端用于说明为什么进入人工验证 */
export interface ChallengeDetection {
  reason: ChallengeReason;
  /** 命中的具体依据，如 status:403、title:just a moment... */
  matched: string[];
  status?: number;
  title?: string;
}

export interface ChallengeDetectInput {
  url: string;
  status?: number;
  title?: string;
  html?: string;
  rules?: AdapterChallengeRules;
}

/**
 * 站点适配器可选的挑战规则，未声明时全部走通用规则。
 */
export interface AdapterChallengeRules {
  /**
   * 自定义判定：
   * - 返回对象表示命中挑战
   * - 返回 null 表示明确不是挑战（覆盖通用启发式）
   * - 返回 undefined 表示没有意见，交给通用规则
   */
  detect?: (input: {
    url: string;
    status?: number;
    title?: string;
    html?: string;
  }) => ChallengeDetection | null | undefined;
  /** 验证通过后必须出现的元素 */
  successSelector?: string;
  /** 视为验证通过的 Cookie 名，默认 ['cf_clearance'] */
  successCookies?: string[];
  /** 需要人工打开的验证入口地址，默认当前页面 */
  verificationUrl?: string;
}

export type ChallengeState =
  | 'pending'
  | 'resolved'
  | 'cancelled'
  | 'timeout'
  | 'window-closed'
  | 'failed';

/** 验证窗口里拿到的会话凭据，只保留在内存中 */
export interface ChallengeVerification {
  /** Cookie 请求头，含 cf_clearance 等，禁止写入日志 */
  cookie: string;
  userAgent?: string;
  finalUrl?: string;
}

export type VerificationFailureReason =
  | 'cancelled'
  | 'timeout'
  | 'window-closed'
  | 'failed';

export class VerificationError extends Error {
  constructor(
    readonly reason: VerificationFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

/** 无头页面命中挑战时抛出，由抓取主干接管并转入人工验证 */
export class ChallengeDetectedError extends Error {
  constructor(readonly detection: ChallengeDetection) {
    super(`检测到人机校验：${detection.matched.join(', ')}`);
    this.name = 'ChallengeDetectedError';
  }
}
