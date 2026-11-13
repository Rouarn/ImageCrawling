import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import type { RequestWithId } from '../common/http/request-with-id';
import { RawResponse } from '../common/http/raw-response.decorator';
import { isAbortError } from '../common/utils/async.util';
import { CrawlService } from './services/crawl.service';
import { CrawlRequestDto, CRAWL_LIMITS } from './dto/crawl-request.dto';
import type { CrawlEvent } from './types/crawl-event';
import { CRAWL_DEFAULTS } from './types/crawl-options';

const HEARTBEAT_INTERVAL_MS = 15_000;

@ApiTags('crawl')
@Controller('api/crawl')
export class CrawlController {
  private readonly logger = new Logger(CrawlController.name);

  constructor(private readonly crawlService: CrawlService) {}

  @Get('options')
  @ApiOperation({
    summary: '获取抓取参数默认值与取值范围',
    description: '前端用于渲染表单默认值与输入约束，避免与后端重复硬编码。',
  })
  getOptions(): {
    defaults: typeof CRAWL_DEFAULTS;
    limits: typeof CRAWL_LIMITS;
  } {
    return { defaults: CRAWL_DEFAULTS, limits: CRAWL_LIMITS };
  }

  @Post('stream')
  @RawResponse()
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '启动抓取任务（SSE 流式进度）',
    description:
      '以 Server-Sent Events 推送结构化抓取事件，事件体为 { type, ... }。' +
      '客户端断开连接即视为取消任务。事件类型：start / log / plan / page-start / ' +
      'page-done / page-fallback / page-failed / discover / download-start / ' +
      'download-progress / complete / error。',
  })
  @ApiOkResponse({ description: 'SSE 事件流（text/event-stream）' })
  async stream(
    @Body() dto: CrawlRequestDto,
    @Req() req: RequestWithId,
    @Res() res: Response,
  ): Promise<void> {
    const controller = new AbortController();
    let finished = false;

    const onClientClose = () => {
      if (!finished) {
        this.logger.warn(`客户端断开连接，取消任务 ${req.id ?? ''}`);
        controller.abort();
      }
    };
    req.on('close', onClientClose);

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: CrawlEvent): void => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n');
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    try {
      await this.crawlService.run(dto, send, controller.signal);
    } catch (error) {
      const event = this.toErrorEvent(error, controller.signal.aborted);
      if (event) send(event);
    } finally {
      finished = true;
      clearInterval(heartbeat);
      req.off('close', onClientClose);
      if (!res.writableEnded) res.end();
    }
  }

  private toErrorEvent(error: unknown, aborted: boolean): CrawlEvent | null {
    if (aborted || isAbortError(error)) {
      return {
        type: 'error',
        error: { code: ErrorCode.CRAWL_ABORTED, message: '任务已取消' },
      };
    }
    if (error instanceof AppException) {
      return {
        type: 'error',
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }
    this.logger.error(
      '抓取任务异常终止',
      error instanceof Error ? error.stack : undefined,
    );
    return {
      type: 'error',
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : '未知错误',
      },
    };
  }
}
