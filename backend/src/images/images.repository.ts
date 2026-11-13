import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { errorMessage } from '../common/utils/async.util';
import { isImageExtension } from '../common/utils/image-signature.util';
import { StorageService } from '../storage/storage.service';
import type { ListImagesQueryDto } from './dto/list-images-query.dto';
import type {
  DeleteOutcome,
  ImageGroupSummary,
  StoredImageFile,
} from './types/image.types';

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

const ROOT_GROUP = 'root';

@Injectable()
export class ImagesRepository {
  private readonly logger = new Logger(ImagesRepository.name);

  constructor(private readonly storage: StorageService) {}

  async listGroups(): Promise<ImageGroupSummary[]> {
    const files = await this.walk();
    const groups = new Map<string, { count: number; updatedAt: string }>();

    for (const file of files) {
      const current = groups.get(file.group);
      if (!current) {
        groups.set(file.group, { count: 1, updatedAt: file.updatedAt });
        continue;
      }
      current.count += 1;
      if (file.updatedAt > current.updatedAt)
        current.updatedAt = file.updatedAt;
    }

    return [...groups.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        if (a.key === ROOT_GROUP) return -1;
        if (b.key === ROOT_GROUP) return 1;
        return collator.compare(a.key, b.key);
      });
  }

  async list(
    query: Required<
      Pick<ListImagesQueryDto, 'group' | 'page' | 'pageSize' | 'sort'>
    > & { q?: string },
  ): Promise<{ items: StoredImageFile[]; total: number }> {
    const all = await this.walk();
    const keyword = query.q?.trim().toLowerCase();

    const filtered = all.filter((file) => {
      if (query.group !== 'all' && file.group !== query.group) return false;
      if (keyword && !file.name.toLowerCase().includes(keyword)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (query.sort === 'newest') {
        const diff = b.updatedAt.localeCompare(a.updatedAt);
        return diff !== 0 ? diff : collator.compare(a.name, b.name);
      }
      const diff = collator.compare(a.name, b.name);
      return diff !== 0 ? diff : a.path.localeCompare(b.path);
    });

    const start = (query.page - 1) * query.pageSize;
    return {
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
    };
  }

  async stat(relativePath: string): Promise<StoredImageFile> {
    const absolute = this.storage.resolve(relativePath);
    const extension = path.extname(relativePath).toLowerCase();
    if (!isImageExtension(extension)) {
      throw new AppException(
        ErrorCode.IMAGE_NOT_FOUND,
        '目标不是受支持的图片文件',
        HttpStatus.NOT_FOUND,
      );
    }

    const stat = await fs.promises.stat(absolute).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new AppException(
        ErrorCode.IMAGE_NOT_FOUND,
        '图片不存在',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      path: relativePath.replace(/^\/+/, ''),
      name: path.posix.basename(relativePath),
      group: this.resolveGroup(relativePath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  async deleteMany(paths: string[]): Promise<DeleteOutcome> {
    const deleted: string[] = [];
    const failed: DeleteOutcome['failed'] = [];

    for (const relativePath of paths) {
      try {
        const normalized = relativePath.replace(/^\/+/, '');
        const absolute = this.storage.resolve(normalized);
        const extension = path.extname(normalized).toLowerCase();
        if (!isImageExtension(extension)) {
          throw new AppException(
            ErrorCode.IMAGE_NOT_FOUND,
            '目标不是受支持的图片文件',
            HttpStatus.NOT_FOUND,
          );
        }
        const stat = await fs.promises.stat(absolute).catch(() => null);
        if (!stat || !stat.isFile()) {
          throw new AppException(
            ErrorCode.IMAGE_NOT_FOUND,
            '图片不存在或已被删除',
            HttpStatus.NOT_FOUND,
          );
        }
        await fs.promises.unlink(absolute);
        deleted.push(normalized);
      } catch (error) {
        failed.push({
          path: relativePath,
          code:
            error instanceof AppException
              ? error.code
              : ErrorCode.STORAGE_ERROR,
          message: errorMessage(error),
        });
      }
    }

    if (deleted.length > 0) {
      this.logger.log(`已删除 ${deleted.length} 张图片`);
    }
    return { deleted, failed };
  }

  private async walk(): Promise<StoredImageFile[]> {
    const files: StoredImageFile[] = [];
    await this.walkDirectory(this.storage.root, '', files);
    return files;
  }

  private async walkDirectory(
    absoluteDirectory: string,
    relativeDirectory: string,
    files: StoredImageFile[],
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(absoluteDirectory, {
        withFileTypes: true,
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      throw new AppException(
        ErrorCode.STORAGE_ERROR,
        `读取目录失败：${errorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        await this.walkDirectory(
          path.join(absoluteDirectory, entry.name),
          relativePath,
          files,
        );
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!isImageExtension(extension)) continue;

      const stat = await fs.promises
        .stat(path.join(absoluteDirectory, entry.name))
        .catch(() => null);
      if (!stat) continue;

      files.push({
        path: relativePath,
        name: entry.name,
        group: this.resolveGroup(relativePath),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  private resolveGroup(relativePath: string): string {
    const segments = relativePath.split('/').filter(Boolean);
    return segments.length > 1 ? segments[0] : ROOT_GROUP;
  }
}
