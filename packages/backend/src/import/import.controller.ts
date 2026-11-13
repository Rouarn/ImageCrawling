import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { AppConfigService } from '../config/app-config.service';
import { StorageService } from '../storage/storage.service';
import {
  ImportImageQueryDto,
  ImportImageResponseDto,
  ImportStatusDto,
} from './dto/import.dto';
import { ImportService } from './import.service';

const IMPORT_TOKEN_HEADER = 'x-import-token';

/**
 * 浏览器扩展专用导入接口。
 *
 * 双重限制：只接受本机回环地址 + 必须携带与 IMPORT_TOKEN 一致的令牌。
 * 请求体是图片原始字节（Content-Type: image/* 或 application/octet-stream）。
 */
@ApiTags('import')
@ApiHeader({
  name: IMPORT_TOKEN_HEADER,
  description: '导入令牌，与后端 IMPORT_TOKEN 环境变量一致',
  required: true,
})
@Controller('api/import')
export class ImportController {
  constructor(
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
    private readonly importService: ImportService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '校验扩展配置（地址与令牌）' })
  @ApiOkResponse({ type: ImportStatusDto })
  status(
    @Req() request: Request,
    @Headers(IMPORT_TOKEN_HEADER) token?: string,
  ): ImportStatusDto {
    this.assertAllowed(request, token);
    return { ready: true, storageRoot: this.storage.root };
  }

  @Post('image')
  @HttpCode(200)
  @ApiOperation({
    summary: '导入单张图片',
    description:
      '按内容 SHA-256 在目标分组内去重；文件名由 hash 前缀与原始文件名生成。',
  })
  @ApiOkResponse({ type: ImportImageResponseDto })
  importImage(
    @Req() request: Request,
    @Headers(IMPORT_TOKEN_HEADER) token: string | undefined,
    @Query() query: ImportImageQueryDto,
    @Body() body: Buffer,
  ): Promise<ImportImageResponseDto> {
    this.assertAllowed(request, token);
    if (!Buffer.isBuffer(body)) {
      throw new AppException(
        ErrorCode.IMPORT_INVALID_IMAGE,
        '请求体必须是图片二进制，且 Content-Type 为 image/* 或 application/octet-stream',
        415,
      );
    }
    return this.importService.importImage({
      group: query.group,
      fileName: query.name,
      sourceUrl: query.sourceUrl,
      buffer: body,
    });
  }

  private assertAllowed(request: Request, token?: string): void {
    if (!isLoopback(request.socket.remoteAddress)) {
      throw new AppException(
        ErrorCode.IMPORT_FORBIDDEN,
        '导入接口只接受本机请求',
        403,
      );
    }

    const expected = this.config.importToken;
    if (!expected) {
      throw new AppException(
        ErrorCode.IMPORT_DISABLED,
        '后端未配置 IMPORT_TOKEN，导入接口已禁用；请在 packages/backend/.env 中设置后重启',
        503,
      );
    }
    if (!token || !safeEqual(token, expected)) {
      throw new AppException(
        ErrorCode.IMPORT_UNAUTHORIZED,
        '导入令牌无效，请在扩展设置中填写与后端 IMPORT_TOKEN 一致的令牌',
        401,
      );
    }
  }
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
}

function safeEqual(value: string, expected: string): boolean {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
