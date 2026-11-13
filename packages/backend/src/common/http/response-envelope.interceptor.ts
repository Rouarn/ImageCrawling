import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { RAW_RESPONSE_KEY } from './raw-response.decorator';

/**
 * 为普通 REST 响应套上 { success: true, data } 结构。
 * 使用 @RawResponse() 的路由（如 SSE）保持原样。
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data: unknown) => {
        if (response.headersSent) return data;
        return { success: true, data: data ?? null };
      }),
    );
  }
}
