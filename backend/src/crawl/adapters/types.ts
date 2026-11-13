/**
 * 站点适配器契约。
 *
 * 通用抓取链路只依赖这里声明的结构，站点相关的判断、请求头、滚动与分页策略
 * 全部收敛在 adapters/ 目录下的具体适配器文件里。
 */

export type AdapterLogLevel = 'info' | 'warn' | 'error';
export type AdapterLogger = (level: AdapterLogLevel, message: string) => void;

/** 适配器可见的配置入口：敏感值只从环境变量读取，不写进源码 */
export interface AdapterConfig {
  get(key: string): string | undefined;
  /** 全局代理地址（CRAWL_PROXY_URL / HTTPS_PROXY / HTTP_PROXY） */
  proxyUrl?: string;
}

export interface AdapterHttpInit {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** 供适配器在开抓前做探测或换取会话的轻量 HTTP 能力 */
export interface AdapterHttp {
  fetchText(url: string, init?: AdapterHttpInit): Promise<string>;
  fetchJson<T = unknown>(url: string, init?: AdapterHttpInit): Promise<T>;
}

export interface AdapterPrepareContext {
  entryUrl: string;
  log: AdapterLogger;
  config: AdapterConfig;
  http: AdapterHttp;
  signal: AbortSignal;
}

export interface AdapterPresetOptions {
  useHeadless?: boolean;
  maxPages?: number;
}

/** 前端站点预设：选中后自动填充入口地址并提示所需条件 */
export interface AdapterPreset {
  entryUrl: string;
  /** 需要用户自己准备的外部条件（代理、登录态等） */
  requires?: string[];
  notes?: string[];
  options?: AdapterPresetOptions;
}

/** 滚动与图片收集策略 */
export interface ScrollStrategy {
  /** page 表示整页滚动，container 表示滚动指定容器，none 表示不滚动 */
  mode?: 'page' | 'container' | 'none';
  selector?: string;
  stepPx?: number;
  intervalMs?: number;
  maxRounds?: number;
  /** 滚动结束后等待懒加载的时间 */
  settleMs?: number;
}

/** 分页规则：任一项命中即由适配器接管，否则回退通用自动翻页 */
export interface AdapterPagination {
  /** 从页面 HTML 解析下一页，返回 null 表示没有下一页 */
  nextPageUrl?(html: string, pageUrl: string): string | null;
  /** 按页码生成页面地址，用于模板式分页 */
  buildPageUrl?(page: number): string | null;
}

/** 开抓前准备动作的产物，全部由通用链路消费 */
export interface AdapterSession {
  /** 覆盖入口 URL */
  entryUrl?: string;
  /** 追加到页面与图片请求的请求头（cookie、authorization 等） */
  headers?: Record<string, string>;
  /** 无头浏览器使用的代理地址 */
  proxyUrl?: string;
  /** 页面加载后等待的选择器；超时视为页面未就绪，任务会以明确错误结束 */
  waitForSelector?: string;
  /** 页面加载后依次点击的选择器（年龄门、同意弹窗等） */
  clickSelectors?: string[];
  /** 滚动策略 */
  scroll?: ScrollStrategy;
  /** 图片下载时的额外请求头（Referer 等） */
  imageHeaders?: (imageUrl: string, pageUrl: string) => Record<string, string>;
  /**
   * 允许页面返回 4xx/5xx 时继续等待渲染。
   * 用于 Cloudflare 挑战页这类「先返回 403、通过校验后才有内容」的场景。
   */
  allowHttpErrors?: boolean;
  /** 面向用户的提示，会写入任务日志 */
  notes?: string[];
}

export interface SiteAdapter {
  /** 唯一标识，同时用于日志与前端预设 */
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** 非空时在 /api/adapters 中作为可选项返回 */
  readonly preset?: AdapterPreset;
  readonly pagination?: AdapterPagination;
  /** 域名或 URL 匹配 */
  matches(url: URL): boolean;
  /** 静态入口 URL 改写 */
  resolveEntryUrl?(url: URL): string;
  /** 开抓前的准备动作（cookie 注入、登录态、代理会话等），可返回 Promise */
  prepare?(
    ctx: AdapterPrepareContext,
  ): AdapterSession | void | Promise<AdapterSession | void>;
}

/** 解析并准备完成后的运行时结果，通用链路只消费这一层 */
export interface AdapterRuntime {
  id: string;
  label: string;
  entryUrl: string;
  headers: Record<string, string>;
  proxyUrl?: string;
  waitForSelector?: string;
  clickSelectors: string[];
  scroll?: ScrollStrategy;
  imageHeaders?: (imageUrl: string, pageUrl: string) => Record<string, string>;
  allowHttpErrors: boolean;
  pagination?: AdapterPagination;
  notes: string[];
}

/** /api/adapters 返回的预设摘要 */
export interface AdapterSummary {
  id: string;
  label: string;
  description: string;
  entryUrl?: string;
  requires: string[];
  notes: string[];
  options?: AdapterPresetOptions;
}
