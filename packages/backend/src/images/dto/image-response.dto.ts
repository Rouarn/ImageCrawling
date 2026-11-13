import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DeleteFailure } from '../types/image.types';

export class ImageItemDto {
  @ApiProperty({ description: '相对存储根目录的路径' })
  path!: string;

  @ApiProperty({ description: '文件名' })
  name!: string;

  @ApiProperty({ description: '所属分组' })
  group!: string;

  @ApiProperty({ description: '可直接访问的静态地址' })
  url!: string;

  @ApiProperty({ description: '文件大小（字节）' })
  size!: number;

  @ApiProperty({ description: '最后修改时间（ISO 8601）' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: '图片宽度（像素）' })
  width?: number;

  @ApiPropertyOptional({ description: '图片高度（像素）' })
  height?: number;

  @ApiPropertyOptional({ description: '图片类型（png/jpeg/...）' })
  type?: string;
}

export class ImageGroupDto {
  @ApiProperty({ description: '分组标识' })
  key!: string;

  @ApiProperty({ description: '展示名称' })
  label!: string;

  @ApiProperty({ description: '图片数量' })
  count!: number;

  @ApiProperty({
    description: '分组内最新图片的修改时间',
    nullable: true,
    type: String,
  })
  updatedAt!: string | null;
}

export class ImageGroupsResponseDto {
  @ApiProperty({ type: [ImageGroupDto] })
  groups!: ImageGroupDto[];

  @ApiProperty({ description: '全部图片总数' })
  total!: number;
}

export class ImageListResponseDto {
  @ApiProperty({ type: [ImageItemDto] })
  items!: ImageItemDto[];

  @ApiProperty({ description: '筛选后的图片总数' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class DeleteFailureDto {
  @ApiProperty()
  path!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;
}

export class DeleteImagesResponseDto {
  @ApiProperty({ type: [String] })
  deleted!: string[];

  @ApiProperty({ type: [DeleteFailureDto] })
  failed!: DeleteFailure[];
}
