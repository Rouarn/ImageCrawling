import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
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
import { HumanVerificationService } from './services/human-verification.service';
import { CrawlRequestDto, CRAWL_LIMITS } from './dto/crawl-request.dto';
import type { CrawlEvent } from './types/crawl-event';
import { CRAWL_DEFAULTS } from './types/crawl-options';

const HEARTBEAT_INTERVAL_MS = 15_000;

@ApiTags('crawl')
@Controller('api/crawl')
export class CrawlController {
  private readonly logger = new Logger(CrawlController.name);

  constructor(
    private readonly crawlService: CrawlService,
    private readonly verification: HumanVerificationService,
  ) {}

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
      'page-done / page-fallback / page-failed / challenge / discover / ' +
      'download-start / download-progress / complete / error。',
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

  @Post('tasks/:taskId/verification')
  @ApiOperation({
    summary: '打开人工验证窗口',
    description:
      '在本机拉起一个正常窗口的 Chrome（独立 profile、沿用任务代理），打开挑战页交给用户手动完成校验。' +
      '任务会保持挂起状态，验证通过后自动继续抓取。',
  })
  @ApiOkResponse({ description: '验证窗口已打开或已在运行' })
  async openVerification(
    @Param('taskId') taskId: string,
  ): Promise<{ status: 'opened' | 'already-open' }> {
    const status = await this.verification.openWindow(taskId);
    return { status };
  }

  @Delete('tasks/:taskId/verification')
  @ApiOperation({
    summary: '取消等待中的人工验证',
    description: '任务会以取消状态结束，验证窗口随之关闭。',
  })
  @ApiOkResponse({ description: '已取消' })
  cancelVerification(@Param('taskId') taskId: string): { status: string } {
    this.verification.cancel(taskId);
    return { status: 'cancelled' };
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
