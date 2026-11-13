// 必须最先执行：加载 backend/.env，且进程环境变量优先
import './config/env-loader';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { StorageService } from './storage/storage.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(AppConfigService);
  const storage = app.get(StorageService);

  app.use(requestIdMiddleware);
  // 浏览器扩展从公网站点访问本机导入接口时，Chrome 的 Private Network Access
  // 会在预检里要求该响应头；必须在 enableCors 之前注册。
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });
  app.enableCors({ origin: true, exposedHeaders: ['x-request-id'] });
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));
  // 扩展导入接口：图片原始字节，Content-Type 为 image/* 或 application/octet-stream
  app.use(
    express.raw({
      type: ['image/*', 'application/octet-stream'],
      limit: config.importBodyLimit,
    }),
  );

  // 静态图片资源：开发环境禁用强缓存，避免删除/替换后看到旧内容
  app.use(
    '/media',
    express.static(storage.root, {
      index: false,
      dotfiles: 'ignore',
      etag: true,
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('图片抓取器 API')
    .setDescription(
      [
        '个人使用的网络图片抓取工具。',
        '',
        '**统一响应结构**：REST 接口成功时返回 `{ success: true, data }`；',
        '失败时返回 `{ success: false, error: { code, message, details? }, meta }`。',
        '',
        '**抓取进度**：请使用 `POST /api/crawl/stream`，通过 SSE 接收结构化事件；',
        '客户端断开连接即取消任务。',
      ].join('\n'),
    )
    .setVersion(config.version)
    .addTag('crawl', '抓取任务')
    .addTag('images', '图片库')
    .addTag('import', '扩展导入')
    .addTag('system', '系统状态')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  const server = app.getHttpServer() as Server;
  // SSE 任务可能持续数分钟，关闭 Node 默认 5 分钟请求超时
  server.requestTimeout = 0;

  Logger.log(`API  : http://${config.host}:${config.port}/api`, 'Bootstrap');
  Logger.log(
    `Docs : http://${config.host}:${config.port}/api/docs`,
    'Bootstrap',
  );
}

void bootstrap();
