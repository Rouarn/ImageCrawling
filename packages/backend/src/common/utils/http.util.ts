import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
  /** 需要走代理时提供，未提供则使用 Node 原生 fetch */
  proxyUrl?: string;
}

/** 只依赖抓取链路真正用到的响应能力，便于在原生 fetch 与 undici 之间切换 */
export interface HttpResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const proxyAgents = new Map<string, ProxyAgent>();

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const cached = proxyAgents.get(proxyUrl);
  if (cached) return cached;
  const agent = new ProxyAgent(proxyUrl);
  proxyAgents.set(proxyUrl, agent);
  return agent;
}

/**
 * 统一的出站请求入口：默认走原生 fetch，配置代理时切换到 undici + ProxyAgent。
 */
export async function requestUrl(
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponseLike> {
  if (!options.proxyUrl) {
    return fetch(url, {
      headers: options.headers,
      redirect: 'follow',
      signal: options.signal,
    });
  }

  return (await undiciFetch(url, {
    headers: options.headers,
    redirect: 'follow',
    signal: options.signal,
    dispatcher: getProxyAgent(options.proxyUrl),
  })) as unknown as HttpResponseLike;
}
