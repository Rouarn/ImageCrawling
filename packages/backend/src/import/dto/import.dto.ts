import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportImageQueryDto {
  @ApiProperty({
    description: '目标分组（data/library 下的相对目录）',
    example: 'girl-atlas',
  })
  @IsString({ message: 'group 必须是字符串' })
  @MaxLength(160, { message: 'group 过长（最多 160 个字符）' })
  group!: string;

  @ApiPropertyOptional({
    description: '原始文件名，用于生成可读文件名；缺省时使用 hash 前缀',
    example: 'summer-01.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: '来源页面地址，仅用于排查问题' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sourceUrl?: string;
}

export class ImportImageResponseDto {
  @ApiProperty({ description: '是否新写入文件（false 表示命中已有内容）' })
  saved!: boolean;

  @ApiProperty({ description: '是否命中去重（同分组内已存在相同内容）' })
  duplicate!: boolean;

  @ApiProperty({ description: '相对存储根目录的路径' })
  path!: string;

  @ApiProperty({ description: '可直接访问的静态地址' })
  url!: string;

  @ApiProperty({ description: '文件大小（字节）' })
  size!: number;

  @ApiProperty({ description: '内容 SHA-256（十六进制）' })
  hash!: string;
}

export class ImportStatusDto {
  @ApiProperty({ description: '导入能力是否可用（token 已配置）' })
  ready!: boolean;

  @ApiProperty({ description: '当前存储根目录' })
  storageRoot!: string;
}
