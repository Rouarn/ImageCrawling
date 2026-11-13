import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

export interface ValidationIssue {
  field: string;
  messages: string[];
}

function flattenErrors(
  errors: ValidationError[],
  parent = '',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const messages = error.constraints ? Object.values(error.constraints) : [];
    if (messages.length > 0) issues.push({ field, messages });
    if (error.children && error.children.length > 0) {
      issues.push(...flattenErrors(error.children, field));
    }
  }
  return issues;
}

/**
 * 全局校验管道：拒绝未声明字段，并输出结构化校验错误。
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors: ValidationError[]) => {
      const details = flattenErrors(errors);
      const summary =
        details.length > 0
          ? details
              .map((item) => `${item.field}: ${item.messages.join('，')}`)
              .join('；')
          : '请求参数不合法';
      return new AppException(
        ErrorCode.VALIDATION_FAILED,
        `请求参数校验失败：${summary}`,
        HttpStatus.BAD_REQUEST,
        details,
      );
    },
  });
}
