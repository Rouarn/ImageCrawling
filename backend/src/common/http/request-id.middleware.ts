import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { RequestWithId } from './request-with-id';

/**
 * 为每个请求分配 requestId，并写入响应头，便于串联日志与错误信息。
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
