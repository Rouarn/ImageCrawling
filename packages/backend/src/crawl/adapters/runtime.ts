import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import {
  combineSignals,
  createTimeoutSignal,
} from '../../common/utils/async.util';
import { requestUrl } from '../../common/utils/http.util';
import type { ResolvedCrawlOptions } from '../types/crawl-options';
import { normalizeHeaders } from '../utils/headers.util';
import type {
  AdapterConfig,
  AdapterHttp,
  AdapterHttpInit,
  AdapterLogger,
  AdapterRuntime,
  SiteAdapter,
} from './types';

/**
 * 适配器可用的轻量 HTTP：自动带超时、取消与代理。
 */
export function createAdapterHttp(params: {
  timeoutMs: number;
  proxyUrl?: string;
  signal: AbortSignal;
}): AdapterHttp {
  const request = async (url: string, init?: AdapterHttpInit) => {
    const timeoutMs = init?.timeoutMs ?? params.timeoutMs;
    const timeout = createTimeoutSignal(timeoutMs);
    const signal = combineSignals([params.signal, timeout.signal]);
    try {
      return await requestUrl(url, {
        headers: init?.headers,
        timeoutMs,
        signal,
        proxyUrl: params.proxyUrl,
      });
    } catch (error) {
      throw new AppException(
        ErrorCode.PAGE_FETCH_FAILED,
        `适配器请求失败：${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.BAD_GATEWAY,
        { url },
      );
    } finally {
      timeout.cancel();
    }
  };

  return {
    async fetchText(url, init) {
      const response = await request(url, init);
      if (!response.ok) {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          `适配器请求失败：HTTP ${response.status}`,
          HttpStatus.BAD_GATEWAY,
          { url },
        );
      }
      return response.text();
    },
    async fetchJson<T>(url: string, init?: AdapterHttpInit) {
      const response = await request(url, init);
      if (!response.ok) {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          `适配器请求失败：HTTP ${response.status}`,
          HttpStatus.BAD_GATEWAY,
          { url },
        );
      }
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          '适配器请求返回的不是合法 JSON',
          HttpStatus.BAD_GATEWAY,
          { url },
        );
      }
    },
  };
}

export interface CreateAdapterRuntimeParams {
  adapter: SiteAdapter;
  url: string;
  timeoutMs: number;
  config: AdapterConfig;
  log: AdapterLogger;
  signal: AbortSignal;
}

/**
 * 执行适配器的入口改写与准备动作，产出通用链路可直接消费的运行时配置。
 */
export async function createAdapterRuntime(
  params: CreateAdapterRuntimeParams,
): Promise<AdapterRuntime> {
  const { adapter, url, timeoutMs, config, log, signal } = params;
  const parsed = new URL(url);
  const staticEntry = adapter.resolveEntryUrl?.(parsed) ?? url;

  const http = createAdapterHttp({
    timeoutMs,
    proxyUrl: config.proxyUrl,
    signal,
  });
  const session =
    (await adapter.prepare?.({
      entryUrl: staticEntry,
      log,
      config,
      http,
      signal,
    })) ?? {};

  return {
    id: adapter.id,
    label: adapter.label,
    entryUrl: session.entryUrl ?? staticEntry,
    headers: normalizeHeaders(session.headers),
    proxyUrl: session.proxyUrl,
    waitForSelector: session.waitForSelector,
    clickSelectors: session.clickSelectors ?? [],
    scroll: session.scroll,
    imageHeaders: session.imageHeaders,
    allowHttpErrors: session.allowHttpErrors ?? false,
    pagination: adapter.pagination,
    challenge: adapter.challenge,
    notes: session.notes ?? [],
  };
}

/**
 * 把适配器运行时结果合并进抓取参数。用户自定义请求头优先级最高。
 */
export function applyAdapterRuntime(
  options: ResolvedCrawlOptions,
  runtime: AdapterRuntime,
): ResolvedCrawlOptions {
  return {
    ...options,
    url: runtime.entryUrl,
    headers: { ...runtime.headers, ...options.headers },
    adapter: runtime,
  };
}
