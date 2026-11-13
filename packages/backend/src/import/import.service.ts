import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { encodePathSegments } from '../common/utils/path.util';
import { sniffImageType } from '../common/utils/image-signature.util';
import { StorageService } from '../storage/storage.service';
import type { ImportImageResponseDto } from './dto/import.dto';

/** 生成文件名时保留的原名长度上限（字符数） */
const MAX_NAME_CHARS = 60;
/** 去重索引缓存：文件名 -> 大小/修改时间/哈希 */
type GroupEntry = { size: number; mtimeMs: number; hash: string };
type GroupIndex = Map<string, GroupEntry>;

export interface ImportImageInput {
  group: string;
  fileName?: string;
  sourceUrl?: string;
  buffer: Buffer;
}

/**
 * 扩展导入：按内容哈希去重后写入 data/library/<分组>/。
 *
 * 去重范围是目标分组：同一张图在同一个分组内只会保留一份；
 * 不同分组各自保存，避免打乱用户的分组整理。
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly indexes = new Map<string, GroupIndex>();

  constructor(private readonly storage: StorageService) {}

  async importImage(input: ImportImageInput): Promise<ImportImageResponseDto> {
    if (input.buffer.length === 0) {
      throw new AppException(
        ErrorCode.IMPORT_INVALID_IMAGE,
        '请求体为空：请直接发送图片二进制内容',
        400,
      );
    }

    const sniffed = sniffImageType(input.buffer);
    if (!sniffed) {
      throw new AppException(
        ErrorCode.IMPORT_INVALID_IMAGE,
        '内容不是可识别的图片（支持 JPG/PNG/GIF/WebP/BMP/SVG/AVIF/HEIC/TIFF/ICO）',
        400,
      );
    }

    const directory = this.storage.resolveDirectory(input.group);
    const hash = createHash('sha256').update(input.buffer).digest('hex');
    const duplicateName = await this.findDuplicate(directory, hash);
    if (duplicateName) {
      return this.result(
        path.join(directory, duplicateName),
        hash,
        input.buffer.length,
        true,
      );
    }

    const baseName = sanitizeBaseName(input.fileName);
    const fileName = `${hash.slice(0, 16)}-${baseName}.${sniffed.ext}`;
    const target = path.join(directory, fileName);

    try {
      await fs.promises.writeFile(target, input.buffer, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new AppException(
          ErrorCode.STORAGE_ERROR,
          `写入图片失败：${(error as Error).message}`,
          500,
        );
      }
      // 同名文件已存在：hash 前缀相同，按内容命中处理，不重复写入
      return this.result(target, hash, input.buffer.length, true);
    }

    this.indexes.get(directory)?.set(fileName, {
      size: input.buffer.length,
      mtimeMs: (await fs.promises.stat(target)).mtimeMs,
      hash,
    });
    this.logger.log(
      `已导入 ${this.storage.toRelative(target)}（${input.buffer.length} 字节${
        input.sourceUrl ? `，来自 ${input.sourceUrl}` : ''
      }）`,
    );
    return this.result(target, hash, input.buffer.length, false);
  }

  private result(
    absolutePath: string,
    hash: string,
    size: number,
    duplicate: boolean,
  ): ImportImageResponseDto {
    const relative = this.storage.toRelative(absolutePath).replace(/\\/g, '/');
    return {
      saved: !duplicate,
      duplicate,
      path: relative,
      url: `/media/${encodePathSegments(relative)}`,
      size,
      hash,
    };
  }

  /**
   * 在目标分组内查找相同内容。索引按「文件名 + 大小 + 修改时间」增量维护，
   * 避免每次导入都重新读取整个分组。
   */
  private async findDuplicate(
    directory: string,
    hash: string,
  ): Promise<string | null> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new AppException(
        ErrorCode.STORAGE_ERROR,
        `读取分组目录失败：${(error as Error).message}`,
        500,
      );
    }

    const cached: GroupIndex =
      this.indexes.get(directory) ?? new Map<string, GroupEntry>();
    const next: GroupIndex = new Map<string, GroupEntry>();
    let matched: string | null = null;

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      const stat = await fs.promises.stat(absolute).catch(() => null);
      if (!stat) continue;

      const known = cached.get(entry.name);
      let fileHash: string;
      if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) {
        fileHash = known.hash;
      } else {
        fileHash = createHash('sha256')
          .update(await fs.promises.readFile(absolute))
          .digest('hex');
      }
      next.set(entry.name, {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        hash: fileHash,
      });
      if (fileHash === hash && !matched) matched = entry.name;
    }

    this.indexes.set(directory, next);
    return matched;
  }
}

/** 清理用户提供的文件名：只保留 basename，替换非法字符，限制长度 */
function sanitizeBaseName(raw: string | undefined): string {
  if (!raw) return 'image';
  const base = path.posix.basename(raw.replace(/\\/g, '/'));
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  const cleaned = stem
    .normalize('NFC')
    .replace(/[\p{Cc}/\\:*?"<>|]+/gu, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, MAX_NAME_CHARS)
    .trim();
  return cleaned || 'image';
}
