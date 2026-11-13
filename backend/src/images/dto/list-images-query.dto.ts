import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ImageSort } from '../types/image.types';

export const IMAGE_PAGE_SIZE_MAX = 200;

export class ListImagesQueryDto {
  @ApiPropertyOptional({
    description: '分组名（顶层目录），all 表示全部，root 表示根目录文件',
    default: 'all',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  group?: string = 'all';

  @ApiPropertyOptional({
    description: '页码，从 1 开始',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: '每页数量',
    default: 48,
    minimum: 1,
    maximum: IMAGE_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1)
  @Max(IMAGE_PAGE_SIZE_MAX)
  pageSize?: number = 48;

  @ApiPropertyOptional({ description: '按文件名搜索（大小写不敏感）' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description: '排序方式：name 按文件名自然排序，newest 按修改时间倒序',
    enum: ['name', 'newest'],
    default: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'newest'])
  sort?: ImageSort = 'name';
}

export class ImageMetadataQueryDto {
  @ApiProperty({ description: '图片相对路径', example: 'example-com/a.jpg' })
  @IsString()
  @MaxLength(512)
  path!: string;
}
