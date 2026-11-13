# 架构与分层

前后端同仓，pnpm workspace 管理。后端是唯一的写入方，前端只通过 HTTP / SSE 与后端交互。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11、Cheerio、Puppeteer、image-size、Swagger |
| 前端 | React 19、Vite 8、Ant Design 6、Tailwind CSS 4、TanStack Query、Zustand |

## 顶层目录

```
image-crawling/
├── packages/
│   ├── backend/    后端源码与配置
│   └── frontend/   前端源码与配置
├── scripts/
│   ├── dev/        启动脚本
│   └── e2e/        端到端套件与 fixture
├── docs/           文档
└── data/           运行时数据（git 忽略）
    ├── library/    抓取产物（存储根目录）
    └── browser/    人工验证用 Chrome profile
```

## 后端分层

```
packages/backend/src/
├── config/       AppConfigService：端口、存储目录、数据目录、代理、Chrome 路径
├── common/
│   ├── errors/   错误码、AppException、全局异常过滤器
│   ├── http/     统一响应包装、请求 ID、校验管道工厂
│   └── utils/    路径安全、AbortSignal、超时、图片文件头识别、系统代理探测
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

约定：

- 所有文件系统路径必须经过 `StorageService`，越界直接返回 `PATH_OUTSIDE_STORAGE`。
- 新增错误场景先补 `ErrorCode`，再抛 `AppException`，不要抛裸 `Error`。
- 新增接口统一使用 DTO 校验与 Swagger 装饰器，保持响应结构与文档同步。
- 站点差异只写在 `crawl/adapters/` 下，通用链路不按域名分支，详见[站点适配器](adapters.md)。

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
   - 静态取页、无头取页、分页规划三条路径都会先过 `ChallengeDetector`：命中人机校验即挂起，转 `HumanVerificationService`，详见[代理与人工验证](proxy-and-verification.md)。
5. 图片地址按页去重后交给 `ImageDownloaderService` 并发下载。
   - 校验文件头与 `content-type`，拒绝 HTML/JS 等非图片。
   - 文件名冲突自动追加后缀。
   - 适配器可补充 Referer 等下载请求头，并指定代理；验证过的站点复用已验证浏览器上下文取图。
6. 全程通过 `CrawlEvent` 推送进度；单页、单图失败不会中断任务（挑战类错误除外）。

## 前端分层

```
packages/frontend/src/
├── api/            契约类型、Axios 客户端、SSE 解析
├── app/            路由、主题、QueryClient、全局任务监听
├── components/
│   ├── layout/     侧栏 / 移动端导航 / 应用壳
│   └── ui/         Panel、Badge、StatTile、EmptyState、Skeleton
├── features/
│   ├── crawl/      表单、任务控制台、日志、指标
│   ├── library/    工具栏、分组筛选、图片卡片/网格、批量选择
│   └── system/     健康检查
├── pages/          页面组合
├── stores/         主题、全局抓取任务
├── lib/            格式化、通知、className
└── styles/         设计令牌与全局样式
```

- `api/client.ts`：Axios 实例、`{ success, data }` 解包、`ApiError` 统一错误（含 `code` / `status` / `requestId`）。
- `api/crawl.ts`：`fetch` + `ReadableStream` 消费 SSE，支持 `AbortController` 取消；非 2xx 会解析统一错误体。
- `features/*/queries.ts`：React Query 查询键与变更，删除后自动失效图片列表与分组缓存。
- `stores/crawl-task-store.ts`：全局任务状态机（idle / running / completed / failed / cancelled），日志与指标由 SSE 事件驱动，切换页面不中断任务。

## 设计系统

- 语义化 CSS 变量：`--canvas`、`--surface`、`--line`、`--ink`、`--accent` 等，浅色/深色两套在 `styles/index.css` 统一定义。
- Ant Design 主题在 `app/antd-theme.ts` 中映射同一套色板与圆角、字体。
- 布局：桌面固定侧栏 + 内容区；窄屏顶部品牌栏 + 底部标签栏，内容区预留安全区。
- 交互：任务控制台实时进度与日志、图片灯箱预览、多选批量删除、复制链接。

## 存储约定

- 存储根目录默认 `data/library/`，可用 `STORAGE_DIR` 覆盖（绝对路径）。
- 所有写入都限制在存储根目录内；`outDir` 只接受相对路径，按黑名单拒绝 `..`、绝对路径、控制字符、Windows 保留名等危险名称，其余自然命名（空格、括号、中文标点、emoji）均可用。
- 图片库分组取存储根目录下的一级目录，直接位于根目录的文件归入“根目录”。
- 同名文件自动追加 `-1`、`-2` 后缀，不会覆盖已有图片。

## 相关文档

- [API 契约](api.md)
- [站点适配器](adapters.md)
- [代理与人工验证](proxy-and-verification.md)
- [测试与 E2E](testing.md)
- [部署](deployment.md)
