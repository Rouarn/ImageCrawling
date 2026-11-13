# Image Crawling · 图片抓取台

个人自用的网络图片抓取工具。前后端同仓（pnpm workspace），后端负责抓取、解析与文件存储，前端提供任务控制台和图片库。

## 功能

- 自动翻页：识别 `rel=next`、`.next` 与“下一页”等模式，也支持 `?page={page}` 分页模板。
- 并发下载：可配置并发数、页间延迟、请求超时与自定义请求头。
- 无头渲染：基于 Puppeteer，可抓取 JS 渲染出的图片。
- 实时进度：`POST /api/crawl/stream` 通过 SSE 推送结构化事件，支持随时取消。
- 图片库：分组统计、文件名搜索、名称/时间排序、服务端分页、灯箱预览、单张/批量删除。
- 统一响应、错误码与请求 ID；Swagger 文档开箱即用。
- 深色/浅色主题、桌面与窄屏响应式布局。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11、Cheerio、Puppeteer、image-size、Swagger |
| 前端 | React 19、Vite 8、Ant Design 6、Tailwind CSS 4、TanStack Query、Zustand |

## 目录结构

```
.
├── backend/src
│   ├── config/          # 运行时配置（端口、存储目录、Chrome 路径）
│   ├── common/          # 统一响应/异常、校验管道、路径与抓取工具
│   ├── storage/         # 存储根目录与路径安全校验
│   ├── crawl/           # 抓取编排、分页规划、解析、无头浏览器、下载
│   │   └── adapters/    # 站点适配器：types / registry / 每站点一个文件
│   ├── images/          # 图片库查询/元信息/批量删除（Repository 隔离文件系统）
│   └── system/          # 健康检查
├── frontend/src
│   ├── api/             # 接口契约、Axios 客户端、SSE 解析
│   ├── app/             # 路由、主题、QueryClient、全局任务监听
│   ├── components/      # 布局壳与通用 UI
│   ├── features/        # crawl / library / system 业务模块
│   ├── pages/           # 页面级组件
│   ├── stores/          # 主题与全局抓取任务状态
│   └── styles/          # 设计令牌与全局样式
├── storage/             # 抓取结果（运行时生成，不入库）
└── scripts/start-dev.sh # 一键启动前后端（macOS）
```

## 快速开始

```bash
pnpm install
pnpm dev-mac
```

- 前端：http://localhost:5173
- 后端：http://localhost:5678/api
- Swagger：http://localhost:5678/api/docs

也可以分别启动：

```bash
pnpm --filter backend start:dev
```

```bash
VITE_API_TARGET=http://localhost:3000 pnpm --filter frontend dev
```

后端默认端口为 `3000`，`scripts/start-dev.sh` 通过 `PORT=5678` 与前端代理保持一致。

### 无头浏览器

无头模式会按固定优先级自动寻找浏览器：`CHROME_PATH` 配置 → 系统常见安装位置（macOS / Windows / Linux 的 Chrome、Chrome Beta、Chrome Canary、Chromium）→ Puppeteer 自带缓存。

本机装了 Chrome 时无需任何配置。只有全部路径都不命中时，才需要手动指定或安装：

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm --filter backend start:dev
```

也可以用 Puppeteer 安装独立版本：

```bash
pnpm --filter backend exec puppeteer browsers install chrome
```

全部未命中时，启动日志和抓取错误会列出实际尝试过的每一个路径，而不是只提示去下载浏览器；健康检查的 `headless.available` 为 `false`。

## 接口说明

所有 REST 接口统一返回：

```json
{ "success": true, "data": {} }
```

失败时由全局异常过滤器兜底：

```json
{
  "success": false,
  "error": { "code": "VALIDATION_FAILED", "message": "请求参数校验失败：...", "details": [] },
  "meta": { "requestId": "uuid", "path": "/api/images", "timestamp": "2026-01-01T00:00:00.000Z" }
}
```

### REST 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/system/health` | 服务、存储与无头浏览器状态 |
| GET | `/api/crawl/options` | 抓取参数默认值与限制 |
| GET | `/api/adapters` | 站点适配器预设（前端下拉数据） |
| POST | `/api/crawl/stream` | 启动抓取任务，SSE 推送进度 |
| GET | `/api/images/groups` | 分组及数量统计 |
| GET | `/api/images` | 分页图片列表（`group` / `page` / `pageSize` / `q` / `sort`） |
| GET | `/api/images/metadata?path=` | 单张图片元信息（含宽高） |
| DELETE | `/api/images` | 批量删除，body 为 `{ "paths": [] }` |
| GET | `/api/docs` | Swagger UI |
| GET | `/api/docs-json` | OpenAPI JSON |

### 抓取请求

```json
{
  "url": "https://example.com/gallery",
  "outDir": "example-com",
  "maxPages": 5,
  "concurrency": 5,
  "pageDelayMs": 300,
  "fetchTimeoutMs": 15000,
  "pagePattern": "https://example.com/list?page={page}",
  "startPage": 1,
  "endPage": 5,
  "useHeadless": false,
  "headers": { "referer": "https://example.com" }
}
```

`outDir` 必须是 `storage/` 下的相对路径；不传时默认 `images`。`pagePattern` 仅在分页模板模式下使用，且必须包含 `{page}`。

### 站点适配器

针对特定站点做隔离适配，通用链路只在入口处解析一次适配器：

- 代码固定在 `backend/src/crawl/adapters/`：`types.ts` 定义契约，`registry.ts` 按数组顺序注册（越靠前优先级越高，默认适配器始终最后），每个站点一个文件。
- 适配器可覆盖：域名/URL 匹配、入口 URL 改写、开抓前准备（Cookie / 登录态 / 代理会话）、页面等待与年龄门点击、滚动与图片收集策略、分页规则、图片下载请求头。
- `CrawlService` 中只有一处 `resolveAdapter()`；未命中任何站点时回落到默认适配器，行为与通用抓取完全一致。
- 代理、Cookie 等敏感或环境相关配置只从环境变量读取，不写进适配器源码。
- 前端“站点预设”下拉数据来自 `GET /api/adapters`，选中后自动填入入口地址与建议参数，并提示该预设需要的额外条件；不选预设时不发送任何额外字段。

`girl-atlas` 适配器用到的环境变量：

| 变量 | 说明 |
| --- | --- |
| `GIRL_ATLAS_PROXY` / `CRAWL_PROXY_URL` | HTTP 代理，形如 `http://127.0.0.1:7897` |
| `GIRL_ATLAS_COOKIE` | 可选，登录态或年龄门 Cookie |

### SSE 事件

每个事件都是 `data: { "type": "...", ... }`：

| type | 关键字段 | 说明 |
| --- | --- | --- |
| `start` | `outDir` / `startedAt` | 任务开始 |
| `log` | `level` / `message` | 人类可读日志 |
| `plan` | `mode` / `pages` / `urls` | 分页规划结果 |
| `page-start` | `index` / `total` / `url` | 开始处理某页 |
| `page-done` | `found` / `added` / `mode` / `durationMs` | 某页完成 |
| `page-fallback` | `reason` | 静态抓取失败，切换无头模式 |
| `page-failed` | `message` | 某页最终失败（任务继续） |
| `discover` | `count` / `pages` | 去重后的图片总数 |
| `download-start` | `total` | 开始下载 |
| `download-progress` | `done` / `total` / `saved` / `failed` | 下载进度 |
| `complete` | `saved` / `failed` / `outDir` / `durationMs` | 任务完成 |
| `error` | `error.code` / `error.message` | 任务失败（含 `CRAWL_ABORTED`） |

客户端断开连接即视为取消任务，后端会中止后续请求。

直接体验：

```bash
curl -N -X POST http://localhost:5678/api/crawl/stream \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/gallery","outDir":"example-com","maxPages":3}'
```

### 错误码

| code | 场景 |
| --- | --- |
| `VALIDATION_FAILED` | DTO / 查询参数校验失败 |
| `INVALID_OUT_DIR` | 输出目录为空、绝对路径或包含非法字符 |
| `INVALID_PAGINATION` | 结束页小于起始页、页数超过上限 |
| `PAGE_FETCH_FAILED` | 页面请求失败或超时 |
| `HEADLESS_UNAVAILABLE` | Chrome 未安装或启动失败 |
| `DOWNLOAD_FAILED` | 单张图片下载/保存失败（出现在失败明细中） |
| `IMAGE_NOT_FOUND` | 图片不存在或不是受支持的图片 |
| `PATH_OUTSIDE_STORAGE` | 路径越出存储根目录 |
| `STORAGE_ERROR` | 文件系统读写异常 |
| `CRAWL_ABORTED` | 任务被取消 |
| `NOT_FOUND` | 路由不存在 |
| `INTERNAL_ERROR` | 未捕获异常 |

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端监听端口 |
| `STORAGE_DIR` | `<仓库>/storage` | 图片存储根目录（绝对路径） |
| `CHROME_PATH` | 空 | 自定义 Chrome 可执行文件（优先于自动探测） |
| `CRAWL_PROXY_URL` | 空 | 适配器可用的出站代理，回退读取 `HTTPS_PROXY` / `HTTP_PROXY` |
| `GIRL_ATLAS_PROXY` | 空 | Girl Atlas 专用代理，优先于 `CRAWL_PROXY_URL` |
| `GIRL_ATLAS_COOKIE` | 空 | Girl Atlas 登录态 / 年龄门 Cookie |
| `VITE_API_TARGET` | `http://localhost:5678` | 前端开发代理目标 |

## 存储约定

- 所有写入都限制在存储根目录内；`outDir` 只接受相对路径，拒绝 `..`、绝对路径和非法字符。
- 图片库分组取存储根目录下的一级目录，直接位于根目录的文件归入“根目录”。
- 下载时会校验文件头与 `content-type`，HTML/JS 等非图片响应会被记为失败而不是写入磁盘。
- 同名文件自动追加 `-1`、`-2` 后缀，不会覆盖已有图片。

## 质量与回归记录

```bash
pnpm --filter backend lint
pnpm --filter backend build
pnpm --filter frontend lint
pnpm --filter frontend build
```

本次重构后的实测结果：

- 后端：构建与 ESLint 通过；Swagger 输出 7 个路径、8 个 Schema（含 `/api/adapters`）。
- 接口：健康检查、参数默认值、分组、分页列表、搜索排序、元信息（返回 1079×1300）、批量删除（1 成功 / 2 失败并返回各自错误码）、非法查询参数、路径穿越拦截均符合预期。
- 抓取：本地测试站点自动翻页 3 页去重后保存 3 张；分页模板 2 页保存 2 张；无头模式发现 5 个地址、保存 3 张，另 2 个非图片响应被拒绝。
- 取消：断开 SSE 后任务停止且不再写文件；前端“取消”按钮同步生效。
- 浏览器回归：真实启动前后端后执行 25 项 UI 断言，全部通过，覆盖抓取、日志、进度、图片库分组/搜索、预览、单张与批量删除、错误提示、深色模式、移动端无横向溢出与底部导航。
- 运行期间浏览器控制台无错误。

### 站点适配器与 Chrome 探测

```bash
pnpm --filter backend test
```

- 适配器契约：14 项断言全部通过，覆盖域名匹配、未匹配回退默认适配器、非法 URL 回退、注册顺序优先级、预设接口字段、默认适配器运行时零副作用、girl-atlas 入口改写 / 代理 / Cookie / 分页解析。
- 前端预设：11 项 UI 断言通过，覆盖下拉出现、自动填入 URL、目录推导、建议页数、条件提示、无头自动开启、清除预设恢复通用模式。
- 适配器接入后默认路径回归仍为 25/25。
- Chrome 探测：不设 `CHROME_PATH` 时命中 `/Applications/Google Chrome.app/...`，健康检查 `headless.available=true`，无头抓取实际保存成功；把所有探测路径置空后，提示会列出 8 条尝试过的路径并指向 `CHROME_PATH`。
- girl-atlas 实测：适配器正常命中并完成入口改写、代理注入、403 容忍、等待与滚动，但本机经 `127.0.0.1:7897` 代理仍停留在 Cloudflare 人机校验页，挑战子资源（`*.challenges.cloudflare.com`）连接被关闭，页面始终未出现真实内容，因此未抓到图片。任务会以 `PAGE_FETCH_FAILED`（页面未渲染出预期内容）明确结束，不会伪装成成功。

## 提交规范

Husky + Commitlint（Conventional Commits）。`pre-commit` 会执行前后端 ESLint，`commit-msg` 校验提交信息。

## License

UNLICENSED
