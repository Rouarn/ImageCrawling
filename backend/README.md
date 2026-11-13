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
│   ├── adapters/ 站点适配器契约、注册表、默认与站点实现
│   ├── dto/      请求参数与校验
│   ├── types/    事件、选项、摘要
│   └── utils/    请求头构造
├── images/       控制器 / 服务 / Repository（文件系统访问）
└── system/       健康检查
```

## 抓取链路

1. `CrawlController` 校验 DTO，建立 SSE 通道，监听客户端断开。
2. `CrawlService` 解析默认值，并在入口处执行唯一一次 `resolveAdapter()`。
   - 命中站点适配器则执行入口改写与 `prepare()`（Cookie、代理会话等）。
   - 未命中则使用默认适配器，运行时配置为空，行为与通用抓取一致。
3. `PaginationPlannerService` 规划分页。
   - 自动模式会边探测下一页边缓存 HTML，后续解析不再重复请求。
   - 模板模式按 `{page}` 生成 URL，单次最多 200 页。
   - 适配器可通过 `pagination.nextPageUrl` / `buildPageUrl` 接管规则。
4. 每页优先静态解析；失败则回退到 `HeadlessBrowserService`。浏览器按代理地址复用实例。
   - 适配器可声明 `waitForSelector`、`clickSelectors`（年龄门）、`scroll` 策略。
   - 静态取页、无头取页、分页规划三条路径都会先过 `ChallengeDetector`：命中人机校验即挂起，转 `HumanVerificationService`。
5. 人工验证：`POST /api/crawl/tasks/:taskId/verification` 拉起本机可见 Chrome（独立 profile、沿用任务代理与 UA），用户完成校验后沿用同一个浏览器上下文继续抓页，任务结束自动关闭窗口。
   - 判定优先级：适配器 `challenge.detect`（`null` 表示明确不是挑战）→ 通用启发式（状态码 / 标题 / 页面标记）。
   - 失败语义：超时 `CHALLENGE_TIMEOUT`、取消 `CRAWL_ABORTED`、窗口关闭或验证后仍被挑战 `CHALLENGE_FAILED`；单任务最多 3 次。
6. 图片地址按页去重后交给 `ImageDownloaderService` 并发下载。
   - 校验文件头与 `content-type`，拒绝 HTML/JS 等非图片。
   - 文件名冲突自动追加后缀。
   - 适配器可补充 Referer 等下载请求头，并指定代理。
7. 全程通过 `CrawlEvent` 推送进度；单页、单图失败不会中断任务（挑战类错误除外）。

## 接口

统一响应 `{ success, data }`，错误 `{ success: false, error: { code, message, details? }, meta }`。

| 方法 | 路径 |
| --- | --- |
| GET | `/api/system/health` |
| GET | `/api/crawl/options` |
| GET | `/api/adapters` |
| POST | `/api/crawl/stream` |
| POST | `/api/crawl/tasks/:taskId/verification` |
| DELETE | `/api/crawl/tasks/:taskId/verification` |
| GET | `/api/images/groups` |
| GET | `/api/images` |
| GET | `/api/images/metadata` |
| DELETE | `/api/images` |

启动后访问 `http://localhost:5678/api/docs` 查看 Swagger。

## 配置

启动时自动加载 `backend/.env`（`src/config/env-loader.ts` 在 `main.ts` 中最先引入），优先级为：真实进程环境变量 > `backend/.env` > 代码默认值。

```bash
cp backend/.env.example backend/.env   # 按需填写，重启后端生效
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `STORAGE_DIR` | `<仓库>/storage` | 存储根目录 |
| `DATA_DIR` | `<仓库>/.data` | 运行态数据目录（人工验证 profile），已忽略 |
| `NODE_ENV` | 空 | `production` 时静态资源缓存 7 天 |
| `CHROME_PATH` | 空 | 无头模式使用的 Chrome 路径（优先于自动探测） |
| `VERIFICATION_TIMEOUT_MS` | `300000` | 人工验证等待超时 |
| `VERIFICATION_PROFILE_TTL_MS` | `604800000` | 验证 profile 复用期限（默认 7 天） |
| `GIRL_ATLAS_PROXY` | 空 | Girl Atlas 专用代理（使用该站点时必须设置其一） |
| `CRAWL_PROXY_URL` | 空 | 通用出站代理 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 空 | 系统代理回退 |
| `GIRL_ATLAS_COOKIE` | 空 | Girl Atlas 登录态 / 年龄门 Cookie（可选） |

完整注释与占位示例见 [`.env.example`](.env.example)。启动日志只报告代理/Cookie 是否已配置，不输出具体值；`backend/.env` 已在 `.gitignore` 中。

## 命令

```bash
pnpm --filter backend start:dev
pnpm --filter backend build
pnpm --filter backend lint
pnpm --filter backend test
```

## 约定

- 所有文件系统路径必须经过 `StorageService`，越界直接返回 `PATH_OUTSIDE_STORAGE`。
- 新增错误场景时先补充 `ErrorCode`，再抛 `AppException`，不要直接抛裸 `Error`。
- 新增接口统一使用 DTO 校验与 Swagger 装饰器，保持响应结构与文档同步。
- 新增站点适配器只在 `crawl/adapters/` 下建文件并追加到 `REGISTERED_ADAPTERS`，不要在通用链路里写站点判断；敏感配置通过 `AdapterConfig.get()` 读环境变量。
- 适配器契约的匹配、回退与注册顺序由 `src/crawl/adapters/adapters.spec.ts` 覆盖，改动契约时同步补断言。
- 挑战判定与人工验证属于通用能力：新增站点差异只写 `adapter.challenge`，不要在 `CrawlService` 里按域名分支。
- 验证窗口的 Cookie 只保留在内存和独立 profile 中：不写日志、不返回给前端、不提交到仓库（`.data/` 已忽略）。
