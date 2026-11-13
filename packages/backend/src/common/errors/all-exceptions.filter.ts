import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';
import type { RequestWithId } from '../http/request-with-id';

interface ErrorPayload {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

interface NestErrorBody {
  code?: string;
  message?: string | string[];
  error?: string;
  details?: unknown;
}

/**
 * 全局异常出口：把任何异常转换成统一的错误响应结构。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const payload = this.normalize(exception);
    if (payload.status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${payload.status} ${payload.code}: ${payload.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.originalUrl} -> ${payload.status} ${payload.code}: ${payload.message}`,
      );
    }

    if (response.headersSent) {
      response.end();
      return;
    }

    response.status(payload.status).json({
      success: false,
      error: {
        code: payload.code,
        message: payload.message,
        ...(payload.details === undefined ? {} : { details: payload.details }),
      },
      meta: {
        requestId: request.id ?? null,
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private normalize(exception: unknown): ErrorPayload {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: this.extractMessage(
          exception.getResponse(),
          exception.message,
        ),
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const isValidation = Array.isArray((body as NestErrorBody)?.message);
      return {
        status,
        code: isValidation
          ? ErrorCode.VALIDATION_FAILED
          : status === Number(HttpStatus.NOT_FOUND)
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR,
        message: this.extractMessage(body, exception.message),
        details: isValidation
          ? (body as NestErrorBody).message
          : (body as NestErrorBody)?.details,
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: exception.message || '服务器内部错误',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: '服务器内部错误',
    };
  }

  private extractMessage(body: unknown, fallback: string): string {
    if (typeof body === 'string') return body;
    if (!body || typeof body !== 'object') return fallback;
    const message = (body as NestErrorBody).message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string' && message) return message;
    return fallback;
  }
}
