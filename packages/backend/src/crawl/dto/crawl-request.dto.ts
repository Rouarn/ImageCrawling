import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CRAWL_LIMITS = {
  maxPages: 50,
  concurrency: 10,
  pageDelayMs: 5000,
  fetchTimeoutMs: 60_000,
} as const;

export class CrawlRequestDto {
  @ApiProperty({
    description: '目标页面地址（http/https）',
    example: 'https://example.com/gallery',
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'url 必须是合法的 http/https 地址' },
  )
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({
    description:
      '存储目录内的相对输出目录，以 / 分隔层级；允许空格、括号、中文标点、书名号与 emoji，' +
      '拒绝空段、. / ..、控制字符、反斜杠、段首/段尾的空格与点、Windows 保留名及超长输入；服务端会先做 Unicode NFC 规范化',
    default: 'images',
    example: '画廊 2024（精选）',
  })
  @IsOptional()
  @IsString()
  outDir?: string;

  @ApiPropertyOptional({
    description: '自动翻页模式下的最大页数',
    default: 10,
    minimum: 1,
    maximum: CRAWL_LIMITS.maxPages,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxPages 必须是整数' })
  @Min(1)
  @Max(CRAWL_LIMITS.maxPages)
  maxPages?: number;

  @ApiPropertyOptional({
    description: '图片并发下载数',
    default: 5,
    minimum: 1,
    maximum: CRAWL_LIMITS.concurrency,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'concurrency 必须是整数' })
  @Min(1)
  @Max(CRAWL_LIMITS.concurrency)
  concurrency?: number;

  @ApiPropertyOptional({
    description: '每页之间的请求延迟（毫秒）',
    default: 300,
    minimum: 0,
    maximum: CRAWL_LIMITS.pageDelayMs,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageDelayMs 必须是整数' })
  @Min(0)
  @Max(CRAWL_LIMITS.pageDelayMs)
  pageDelayMs?: number;

  @ApiPropertyOptional({
    description: '单次请求超时时间（毫秒）',
    default: 15_000,
    minimum: 1000,
    maximum: CRAWL_LIMITS.fetchTimeoutMs,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'fetchTimeoutMs 必须是整数' })
  @Min(1000)
  @Max(CRAWL_LIMITS.fetchTimeoutMs)
  fetchTimeoutMs?: number;

  @ApiPropertyOptional({
    description: '分页模式模板，必须包含 {page} 占位符',
    example: 'https://example.com/list?page={page}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/\{page\}/, { message: 'pagePattern 必须包含 {page} 占位符' })
  pagePattern?: string;

  @ApiPropertyOptional({
    description: '分页模式起始页',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'startPage 必须是整数' })
  @Min(1)
  startPage?: number;

  @ApiPropertyOptional({ description: '分页模式结束页', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'endPage 必须是整数' })
  @Min(1)
  endPage?: number;

  @ApiPropertyOptional({
    description: '是否使用无头浏览器（Puppeteer）渲染页面',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  useHeadless?: boolean;

  @ApiPropertyOptional({
    description: '自定义请求头，会覆盖默认请求头',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { 'user-agent': 'Mozilla/5.0', cookie: 'a=b' },
  })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
