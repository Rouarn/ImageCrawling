import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import {
  combineSignals,
  createTimeoutSignal,
  errorMessage,
  isAbortError,
} from '../../common/utils/async.util';
import { requestUrl } from '../../common/utils/http.util';
import { buildHtmlHeaders } from '../utils/headers.util';

export interface FetchHtmlOptions {
  headers?: Record<string, unknown>;
  timeoutMs: number;
  /** 站点适配器需要的代理 */
  proxyUrl?: string;
  signal?: AbortSignal;
}

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
}

@Injectable()
export class PageFetcherService {
  private readonly logger = new Logger(PageFetcherService.name);

  /**
   * 以静态方式获取页面 HTML，失败时抛出带错误码的 AppException。
   */
  async fetchHtml(
    url: string,
    options: FetchHtmlOptions,
  ): Promise<FetchedPage> {
    const timeout = createTimeoutSignal(options.timeoutMs);
    const signal = combineSignals([options.signal, timeout.signal]);

    try {
      const response = await requestUrl(url, {
        headers: buildHtmlHeaders(options.headers),
        timeoutMs: options.timeoutMs,
        proxyUrl: options.proxyUrl,
        signal,
      });

      if (!response.ok) {
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          `页面请求失败：HTTP ${response.status} ${response.statusText}`,
          HttpStatus.BAD_GATEWAY,
          { url, status: response.status },
        );
      }

      const html = await response.text();
      return { url: response.url || url, status: response.status, html };
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (isAbortError(error)) {
        if (options.signal?.aborted) throw error;
        throw new AppException(
          ErrorCode.PAGE_FETCH_FAILED,
          `页面请求超时（${options.timeoutMs}ms）`,
          HttpStatus.GATEWAY_TIMEOUT,
          { url },
        );
      }
      this.logger.warn(`页面请求失败 ${url}: ${errorMessage(error)}`);
      throw new AppException(
        ErrorCode.PAGE_FETCH_FAILED,
        `页面请求失败：${errorMessage(error)}`,
        HttpStatus.BAD_GATEWAY,
        { url },
      );
    } finally {
      timeout.cancel();
    }
  }
}
