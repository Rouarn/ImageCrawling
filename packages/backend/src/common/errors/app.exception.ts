import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-code';

/**
 * 带业务错误码的异常，由全局异常过滤器统一序列化。
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
