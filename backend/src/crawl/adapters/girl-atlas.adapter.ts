import { load } from 'cheerio';
import type { SiteAdapter } from './types';

const HOSTS = new Set(['girl-atlas.com', 'www.girl-atlas.com']);

const PROXY_ENV_KEYS = ['GIRL_ATLAS_PROXY', 'CRAWL_PROXY_URL'] as const;
const COOKIE_ENV_KEYS = ['GIRL_ATLAS_COOKIE'] as const;

/**
 * Girl Atlas 适配器。
 *
 * 站点特征（与通用链路的差异全部收敛在这里）：
 * - 本机 DNS 解析被污染，必须经代理访问；
 * - 站点在 Cloudflare 人机校验之后，静态请求只能拿到挑战页，需要无头浏览器；
 * - 内容页有 18+ 年龄门，需要点击进入；
 * - 图片为懒加载，需要滚动触发后再收集；
 * - 图片可能校验 Referer。
 *
 * 代理、Cookie 等敏感信息一律从环境变量读取，不写死在源码里。
 */
export const girlAtlasAdapter: SiteAdapter = {
  id: 'girl-atlas',
  label: 'Girl Atlas',
  description:
    '图集站点：需要代理绕过 DNS 污染并通过 Cloudflare 校验，页面懒加载，存在 18+ 年龄门。',
  preset: {
    entryUrl: 'https://www.girl-atlas.com/',
    requires: [
      '可用的 HTTP 代理：设置 GIRL_ATLAS_PROXY 或 CRAWL_PROXY_URL（形如 http://127.0.0.1:7897）',
      '本机 Chrome（无头模式，用于通过 Cloudflare 校验）',
    ],
    notes: [
      '站点在 Cloudflare 人机校验之后，静态请求只会拿到挑战页，请保持无头模式开启。',
      '如需登录态，可通过 GIRL_ATLAS_COOKIE 注入 Cookie。',
    ],
    options: { useHeadless: true, maxPages: 3 },
  },
  pagination: {
    nextPageUrl(html, pageUrl) {
      const $ = load(html);
      const selectors = [
        'link[rel="next"]',
        'a[rel="next"]',
        '.pagination a.next',
        '.pagination-next a',
        'a.next.page-numbers',
        '.nav-links a.next',
      ];
      for (const selector of selectors) {
        const href = $(selector).first().attr('href');
        if (!href) continue;
        try {
          return new URL(href, pageUrl).href;
        } catch {
          continue;
        }
      }
      return null;
    },
  },
  // 站点在 Cloudflare 后面：以 cf_clearance 作为通过依据，验证入口为站点首页
  challenge: {
    successCookies: ['cf_clearance', 'cf_clearance_v2'],
    verificationUrl: 'https://www.girl-atlas.com/',
  },
  matches(url) {
    return HOSTS.has(url.hostname.toLowerCase());
  },
  resolveEntryUrl(url) {
    const normalized = new URL(url.href);
    normalized.protocol = 'https:';
    normalized.hostname = 'www.girl-atlas.com';
    return normalized.href;
  },
  prepare({ log, config, entryUrl }) {
    const proxyUrl =
      readFirst(config, PROXY_ENV_KEYS) ?? config.proxyUrl ?? undefined;
    const cookie = readFirst(config, COOKIE_ENV_KEYS);

    const headers: Record<string, string> = {};
    if (cookie) {
      headers.cookie = cookie;
      log('info', 'Girl Atlas：已注入 GIRL_ATLAS_COOKIE');
    }

    const notes: string[] = [];
    if (!proxyUrl) {
      notes.push(
        '未配置代理（GIRL_ATLAS_PROXY / CRAWL_PROXY_URL），该站点在本机 DNS 解析被污染，预计无法访问。',
      );
    } else {
      log('info', `Girl Atlas：使用代理 ${maskProxy(proxyUrl)}`);
    }
    if (!cookie) {
      notes.push('未配置 GIRL_ATLAS_COOKIE，将尝试以访客身份通过年龄门。');
    }

    log('info', `Girl Atlas：入口地址 ${entryUrl}`);

    return {
      proxyUrl,
      headers,
      waitForSelector: '.main-content, .card, main, article, #content',
      clickSelectors: [
        '#adult-18-modal button',
        '#adult-18-modal .btn',
        '.age-gate button',
        '.age-verification button',
        '[class*="age-gate"] button',
        '[class*="age-verify"] button',
        '.modal button',
      ],
      scroll: {
        mode: 'page',
        stepPx: 900,
        intervalMs: 260,
        maxRounds: 14,
        settleMs: 1600,
      },
      imageHeaders(_imageUrl, pageUrl) {
        return {
          referer: pageUrl,
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'same-origin',
        };
      },
      // Cloudflare 挑战页会先返回 403，通过校验后才渲染真实内容
      allowHttpErrors: true,
      notes,
    };
  },
};

function readFirst(
  config: { get(key: string): string | undefined },
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = config.get(key);
    if (value) return value;
  }
  return undefined;
}

/** 日志里不完整输出代理凭据 */
function maskProxy(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.href;
  } catch {
    return '(无法解析的代理地址)';
  }
}
