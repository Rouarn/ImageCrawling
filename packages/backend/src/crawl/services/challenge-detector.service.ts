import { Injectable } from '@nestjs/common';
import type {
  AdapterChallengeRules,
  ChallengeDetectInput,
  ChallengeDetection,
} from '../types/challenge';

const TITLE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/just a moment/i, 'title:just a moment'],
  [/attention required/i, 'title:attention required'],
  [/checking your browser/i, 'title:checking your browser'],
  [/verify you are human/i, 'title:verify you are human'],
  [/security check/i, 'title:security check'],
  [/请稍候/, 'title:请稍候'],
  [/安全验证/, 'title:安全验证'],
  [/正在验证/, 'title:正在验证'],
  [/人机验证/, 'title:人机验证'],
  [/访问验证/, 'title:访问验证'],
];

const HTML_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['cf_chl_opt', 'marker:cf_chl_opt'],
  ['cf-challenge', 'marker:cf-challenge'],
  ['challenge-platform', 'marker:challenge-platform'],
  ['__cf_chl', 'marker:__cf_chl'],
  ['cf-error-details', 'marker:cf-error-details'],
  ['g-recaptcha', 'marker:recaptcha'],
  ['h-captcha', 'marker:hcaptcha'],
  ['captcha-delivery', 'marker:captcha-delivery'],
  ['px-captcha', 'marker:px-captcha'],
  ['ddos-guard', 'marker:ddos-guard'],
];

/**
 * 通用挑战页判定。适配器返回 null 时视为明确否定，覆盖通用启发式。
 */
@Injectable()
export class ChallengeDetector {
  detect(input: ChallengeDetectInput): ChallengeDetection | undefined {
    const custom = this.runAdapterRule(input);
    if (custom !== undefined) return custom ?? undefined;

    const matched: string[] = [];

    if (input.status === 403) matched.push('status:403');
    if (input.status === 429) matched.push('status:429');

    const title = input.title?.trim();
    if (title) {
      for (const [pattern, label] of TITLE_PATTERNS) {
        if (pattern.test(title)) matched.push(label);
      }
    }

    const html = input.html;
    if (html) {
      const lower = html.toLowerCase();
      for (const [marker, label] of HTML_MARKERS) {
        if (lower.includes(marker.toLowerCase())) matched.push(label);
      }
    }

    if (matched.length === 0) return undefined;

    const reason =
      input.status === 429
        ? 'http-429'
        : input.status === 403
          ? 'http-403'
          : 'challenge-page';

    return {
      reason,
      matched: [...new Set(matched)],
      status: input.status,
      title: title || undefined,
    };
  }

  private runAdapterRule(
    input: ChallengeDetectInput,
  ): ChallengeDetection | null | undefined {
    const detect = input.rules?.detect;
    if (!detect) return undefined;
    return detect({
      url: input.url,
      status: input.status,
      title: input.title,
      html: input.html,
    });
  }
}

export function isChallengeRuleDefined(rules?: AdapterChallengeRules): boolean {
  if (!rules) return false;
  return Boolean(
    rules.detect ||
    rules.successSelector ||
    rules.successCookies?.length ||
    rules.verificationUrl,
  );
}
