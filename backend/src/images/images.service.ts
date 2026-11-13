import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import { imageSize } from 'image-size';
import { errorMessage } from '../common/utils/async.util';
import { encodePathSegments } from '../common/utils/path.util';
import { StorageService } from '../storage/storage.service';
import type { ListImagesQueryDto } from './dto/list-images-query.dto';
import type {
  DeleteImagesResponseDto,
  ImageGroupDto,
  ImageGroupsResponseDto,
  ImageItemDto,
  ImageListResponseDto,
} from './dto/image-response.dto';
import { ImagesRepository } from './images.repository';
import type { StoredImageFile } from './types/image.types';

const DEFAULT_PAGE_SIZE = 48;

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    private readonly repository: ImagesRepository,
    private readonly storage: StorageService,
  ) {}

  async getGroups(): Promise<ImageGroupsResponseDto> {
    const groups = await this.repository.listGroups();
    const items: ImageGroupDto[] = groups.map((group) => ({
      key: group.key,
      label: group.key === 'root' ? '根目录' : group.key,
      count: group.count,
      updatedAt: group.updatedAt,
    }));
    return {
      groups: items,
      total: items.reduce((sum, group) => sum + group.count, 0),
    };
  }

  async list(query: ListImagesQueryDto): Promise<ImageListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { items, total } = await this.repository.list({
      group: query.group?.trim() || 'all',
      page,
      pageSize,
      sort: query.sort ?? 'name',
      q: query.q,
    });

    return {
      items: items.map((file) => this.toItem(file)),
      total,
      page,
      pageSize,
    };
  }

  async getMetadata(relativePath: string): Promise<ImageItemDto> {
    const file = await this.repository.stat(relativePath);
    const item = this.toItem(file);
    const dimensions = await this.readDimensions(file);
    if (dimensions) {
      item.width = dimensions.width;
      item.height = dimensions.height;
      item.type = dimensions.type;
    }
    return item;
  }

  async delete(paths: string[]): Promise<DeleteImagesResponseDto> {
    return this.repository.deleteMany(paths);
  }

  private toItem(file: StoredImageFile): ImageItemDto {
    return {
      path: file.path,
      name: file.name,
      group: file.group,
      url: `/storage/${encodePathSegments(file.path)}`,
      size: file.size,
      updatedAt: file.updatedAt,
    };
  }

  private async readDimensions(
    file: StoredImageFile,
  ): Promise<{ width?: number; height?: number; type?: string } | null> {
    try {
      const buffer = await fs.promises.readFile(
        this.storage.resolve(file.path),
      );
      const size = imageSize(buffer);
      return { width: size.width, height: size.height, type: size.type };
    } catch (error) {
      this.logger.warn(`读取图片尺寸失败 ${file.path}: ${errorMessage(error)}`);
      return null;
    }
  }
}
