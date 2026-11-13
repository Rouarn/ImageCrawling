# Backend · Image Crawler

NestJS 11 + TypeScript。负责抓取编排、HTML 解析、无头渲染、图片下载与图片库查询。

## 模块

```
src/
├── config/       AppConfigService：端口、存储目录、Chrome 路径
├── common/
│   ├── errors/   错误码、AppException、全局异常过滤器
│   ├── http/     统一响应包装、请求 ID、校验管道工厂
│   └── utils/    路径安全、AbortSignal、超时、图片文件头识别
├── storage/      存储根目录与路径校验的唯一入口
├── crawl/
│   ├── services/ 分页规划 / 静态抓取 / 解析 / 无头浏览器 / 下载 / 编排
│   ├── dto/      请求参数与校验
│   ├── types/    事件、选项、摘要
│   └── utils/    请求头构造
├── images/       控制器 / 服务 / Repository（文件系统访问）
└── system/       健康检查
```

## 抓取链路

1. `CrawlController` 校验 DTO，建立 SSE 通道，监听客户端断开。
2. `CrawlService` 解析默认值，调用 `PaginationPlannerService` 规划分页。
   - 自动模式会边探测下一页边缓存 HTML，后续解析不再重复请求。
   - 模板模式按 `{page}` 生成 URL，单次最多 200 页。
3. 每页优先静态解析；失败则回退到 `HeadlessBrowserService`。浏览器实例在进程内复用。
4. 图片地址按页去重后交给 `ImageDownloaderService` 并发下载。
   - 校验文件头与 `content-type`，拒绝 HTML/JS 等非图片。
   - 文件名冲突自动追加后缀。
5. 全程通过 `CrawlEvent` 推送进度；单页、单图失败不会中断任务。

## 接口

统一响应 `{ success, data }`，错误 `{ success: false, error: { code, message, details? }, meta }`。

| 方法 | 路径 |
| --- | --- |
| GET | `/api/system/health` |
| GET | `/api/crawl/options` |
| POST | `/api/crawl/stream` |
| GET | `/api/images/groups` |
| GET | `/api/images` |
| GET | `/api/images/metadata` |
| DELETE | `/api/images` |

启动后访问 `http://localhost:5678/api/docs` 查看 Swagger。

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `STORAGE_DIR` | `<仓库>/storage` | 存储根目录 |
| `CHROME_PATH` | 空 | 无头模式使用的 Chrome 路径 |

## 命令

```bash
pnpm --filter backend start:dev
pnpm --filter backend build
pnpm --filter backend lint
```

## 约定

- 所有文件系统路径必须经过 `StorageService`，越界直接返回 `PATH_OUTSIDE_STORAGE`。
- 新增错误场景时先补充 `ErrorCode`，再抛 `AppException`，不要直接抛裸 `Error`。
- 新增接口统一使用 DTO 校验与 Swagger 装饰器，保持响应结构与文档同步。
