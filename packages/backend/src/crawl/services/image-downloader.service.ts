import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import {
  combineSignals,
  createTimeoutSignal,
  isAbortError,
} from '../../common/utils/async.util';
import { requestUrl } from '../../common/utils/http.util';
import {
  extensionFromMime,
  isImageExtension,
  sniffImageType,
} from '../../common/utils/image-signature.util';
import { StorageService } from '../../storage/storage.service';
import type {
  DownloadProgress,
  FailedImage,
  SavedImage,
} from '../types/crawl-event';
import type { ResolvedCrawlOptions } from '../types/crawl-options';
import { buildImageHeaders } from '../utils/headers.util';

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const NON_IMAGE_CONTENT_TYPE =
  /^(text\/html|application\/xhtml\+xml|application\/json|application\/javascript|text\/javascript|text\/plain)/;

const EXT_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  tif: 'tiff',
};

/** 通过已验证浏览器上下文取二进制内容（图片） */
export type BinaryFetcher = (url: string) => Promise<{
  status: number;
  contentType: string;
  buffer: Buffer;
}>;

/** 常见网络错误码的中文说明，方便直接看出是代理、DNS 还是鉴权问题 */
const NETWORK_CODE_HINTS: Record<string, string> = {
  ENOTFOUND: '域名解析失败',
  EAI_AGAIN: 'DNS 解析暂时失败',
  ECONNREFUSED: '连接被拒绝（代理未启动？）',
  ECONNRESET: '连接被重置',
  ETIMEDOUT: '连接超时',
  UND_ERR_CONNECT_TIMEOUT: '连接超时',
  UND_ERR_HEADERS_TIMEOUT: '等待响应头超时',
  UND_ERR_BODY_TIMEOUT: '读取响应体超时',
  CERT_HAS_EXPIRED: '证书已过期',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: '证书校验失败',
  DEPTH_ZERO_SELF_SIGNED_CERT: '证书不受信任',
};

/** 把下载异常转成可读原因，保留 HTTP 状态码与底层网络错误码 */
export function describeFailure(error: unknown): string {
  if (error instanceof AppException) return error.message;
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return '请求超时或已被取消';
  }

  const base = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown })?.cause as
    | { code?: unknown }
    | undefined;
  const code = typeof cause?.code === 'string' ? cause.code : undefined;
  if (!code) return base;

  const hint = NETWORK_CODE_HINTS[code];
  return `${base}（${code}${hint ? `，${hint}` : ''}）`;
}

@Injectable()
export class ImageDownloaderService {
  private readonly logger = new Logger(ImageDownloaderService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * 并发下载图片。单张失败只记录，不中断整体任务。
   */
  async downloadAll(
    urls: string[],
    outDirAbsolute: string,
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void,
    onFailure?: (failure: FailedImage) => void,
    fetchBinary?: BinaryFetcher,
  ): Promise<{ saved: SavedImage[]; failed: FailedImage[] }> {
    const saved: SavedImage[] = [];
    const failed: FailedImage[] = [];
    const usedNames = new Set<string>();
    const total = urls.length;
    if (total === 0) return { saved, failed };

    let cursor = 0;
    let done = 0;
    const workerCount = Math.min(options.concurrency, total);

    const workers = Array.from({ length: workerCount }, async () => {
      for (;;) {
        if (signal.aborted) return;
        const index = cursor;
        cursor += 1;
        if (index >= total) return;

        const url = urls[index];
        try {
          const item = await this.saveImage(
            url,
            outDirAbsolute,
            usedNames,
            options,
            signal,
            fetchBinary,
          );
          saved.push(item);
          this.logger.verbose(`已保存 ${item.path}`);
        } catch (error) {
          if (isAbortError(error) && signal.aborted) return;
          const reason = describeFailure(error);
          const failure = { url, reason };
          failed.push(failure);
          onFailure?.(failure);
          this.logger.warn(`下载失败 ${url}: ${reason}`);
        } finally {
          done += 1;
          onProgress({
            done,
            total,
            saved: saved.length,
            failed: failed.length,
          });
        }
      }
    });

    await Promise.allSettled(workers);
    if (signal.aborted) {
      throw new DOMException('任务已取消', 'AbortError');
    }
    return { saved, failed };
  }

  private async saveImage(
    url: string,
    outDirAbsolute: string,
    usedNames: Set<string>,
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    fetchBinary?: BinaryFetcher,
  ): Promise<SavedImage> {
    if (url.startsWith('data:')) {
      return this.saveDataUrl(url, outDirAbsolute, usedNames);
    }
    return this.saveRemoteImage(
      url,
      outDirAbsolute,
      usedNames,
      options,
      signal,
      fetchBinary,
    );
  }

  private async saveRemoteImage(
    url: string,
    outDirAbsolute: string,
    usedNames: Set<string>,
    options: ResolvedCrawlOptions,
    signal: AbortSignal,
    fetchBinary?: BinaryFetcher,
  ): Promise<SavedImage> {
    const timeout = createTimeoutSignal(options.fetchTimeoutMs);
    const combined = combineSignals([signal, timeout.signal]);

    try {
      const referer = this.resolveReferer(url, options);
      const adapterHeaders =
        options.adapter?.imageHeaders?.(url, referer) ?? {};

      let status: number;
      let statusText = '';
      let rawContentType: string;
      let buffer: Buffer;

      if (fetchBinary) {
        // 已验证的站点：复用浏览器会话，带着 cf_clearance 与真实指纹取图
        const fetched = await fetchBinary(url);
        status = fetched.status;
        rawContentType = fetched.contentType;
        buffer = fetched.buffer;
      } else {
        const response = await requestUrl(url, {
          headers: {
            ...buildImageHeaders(referer, options.headers),
            ...adapterHeaders,
          },
          timeoutMs: options.fetchTimeoutMs,
          proxyUrl: options.proxyUrl ?? options.adapter?.proxyUrl,
          signal: combined,
        });
        status = response.status;
        statusText = response.statusText;
        rawContentType = response.headers.get('content-type') || '';
        buffer = Buffer.from(await response.arrayBuffer());
      }

      if (status < 200 || status >= 300) {
        throw new AppException(
          ErrorCode.DOWNLOAD_FAILED,
          `HTTP ${status}${statusText ? ` ${statusText}` : ''}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const contentType = rawContentType.split(';')[0].trim().toLowerCase();
      if (buffer.length === 0) {
        throw new AppException(
          ErrorCode.DOWNLOAD_FAILED,
          '响应内容为空',
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new AppException(
          ErrorCode.DOWNLOAD_FAILED,
          `图片过大（${Math.round(buffer.length / 1024 / 1024)}MB），已跳过`,
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }

      const dataUrlPrefix = buffer.toString('utf8', 0, 64).trimStart();
      if (dataUrlPrefix.startsWith('data:')) {
        return this.saveDataUrl(
          buffer.toString('utf8'),
          outDirAbsolute,
          usedNames,
          url,
        );
      }

      const ext = this.resolveExtension(url, contentType, buffer);
      const fileName = this.allocateFileName(
        outDirAbsolute,
        this.buildStem(url),
        ext,
        usedNames,
      );
      await fs.promises.writeFile(path.join(outDirAbsolute, fileName), buffer);

      return this.toSavedImage(url, outDirAbsolute, fileName);
    } finally {
      timeout.cancel();
    }
  }

  private async saveDataUrl(
    dataUrl: string,
    outDirAbsolute: string,
    usedNames: Set<string>,
    originalUrl = 'data:',
  ): Promise<SavedImage> {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
      throw new AppException(
        ErrorCode.DOWNLOAD_FAILED,
        '非法的 Data URL：缺少逗号分隔符',
        HttpStatus.BAD_REQUEST,
      );
    }

    const meta = dataUrl.slice(0, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    const parts = meta.split(';');
    const mime = (parts[0] || '').replace('data:', '').trim().toLowerCase();
    const isBase64 = parts.includes('base64');

    let buffer: Buffer;
    try {
      buffer = isBase64
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf8');
    } catch {
      throw new AppException(
        ErrorCode.DOWNLOAD_FAILED,
        'Data URL 内容解码失败',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (buffer.length === 0) {
      throw new AppException(
        ErrorCode.DOWNLOAD_FAILED,
        'Data URL 内容为空',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sniffed = sniffImageType(buffer);
    const ext = sniffed?.ext || extensionFromMime(mime);
    if (!ext) {
      throw new AppException(
        ErrorCode.DOWNLOAD_FAILED,
        `Data URL 不是受支持的图片类型（${mime || '未知'}）`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 12);
    const fileName = this.allocateFileName(
      outDirAbsolute,
      `data-${hash}`,
      ext,
      usedNames,
    );
    await fs.promises.writeFile(path.join(outDirAbsolute, fileName), buffer);
    return this.toSavedImage(originalUrl, outDirAbsolute, fileName);
  }

  private resolveExtension(
    url: string,
    contentType: string,
    buffer: Buffer,
  ): string {
    const sniffed = sniffImageType(buffer);
    if (sniffed) return sniffed.ext;

    const mimeExt = extensionFromMime(contentType);
    if (mimeExt) return mimeExt;

    if (NON_IMAGE_CONTENT_TYPE.test(contentType) || !contentType) {
      throw new AppException(
        ErrorCode.DOWNLOAD_FAILED,
        `响应不是图片（content-type: ${contentType || '未知'}）`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const urlExt = this.urlExtension(url);
    if (urlExt) return EXT_ALIASES[urlExt] ?? urlExt;

    throw new AppException(
      ErrorCode.DOWNLOAD_FAILED,
      '无法识别图片类型',
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }

  private allocateFileName(
    outDirAbsolute: string,
    stem: string,
    extension: string,
    usedNames: Set<string>,
  ): string {
    const ext = EXT_ALIASES[extension] ?? extension;
    let candidate = `${stem}.${ext}`;
    let suffix = 1;
    while (
      usedNames.has(candidate) ||
      fs.existsSync(path.join(outDirAbsolute, candidate))
    ) {
      candidate = `${stem}-${suffix}.${ext}`;
      suffix += 1;
      if (suffix > 9999) {
        throw new AppException(
          ErrorCode.DOWNLOAD_FAILED,
          '文件名冲突过多，无法保存',
          HttpStatus.CONFLICT,
        );
      }
    }
    usedNames.add(candidate);
    return candidate;
  }

  private buildStem(url: string): string {
    let base = '';
    try {
      base = decodeURIComponent(path.posix.basename(new URL(url).pathname));
    } catch {
      base = '';
    }
    const withoutExt = base.replace(/\.[^.]{1,8}$/, '');
    const sanitized = withoutExt
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '')
      .slice(0, 80);

    if (sanitized) return sanitized;
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
    return `image-${hash}`;
  }

  private urlExtension(url: string): string {
    try {
      const ext = path.posix.extname(new URL(url).pathname).toLowerCase();
      const normalized = ext.replace('.', '');
      return isImageExtension(ext) ? normalized : '';
    } catch {
      return '';
    }
  }

  private resolveReferer(url: string, options: ResolvedCrawlOptions): string {
    return options.headers.referer || options.url || url;
  }

  private toSavedImage(
    url: string,
    outDirAbsolute: string,
    fileName: string,
  ): SavedImage {
    return {
      url,
      file: fileName,
      path: this.storage.toRelative(path.join(outDirAbsolute, fileName)),
    };
  }
}
