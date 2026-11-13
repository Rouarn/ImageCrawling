# Image Crawling · 图片抓取台

个人自用的网络图片抓取工具。前后端同仓（pnpm workspace），后端负责抓取、解析与文件存储，前端提供任务控制台和图片库。

## 功能

- 自动翻页：识别 `rel=next`、`.next` 与“下一页”等模式，也支持 `?page={page}` 分页模板。
- 并发下载：可配置并发数、页间延迟、请求超时与自定义请求头。
- 无头渲染：基于 Puppeteer，可抓取 JS 渲染出的图片。
- 实时进度：`POST /api/crawl/stream` 通过 SSE 推送结构化事件，支持随时取消。
- 任务日志：面板可一键复制全部输出（时间 + 级别 + 内容，含已滚出视口的历史行）；下载失败会逐条记录 HTTP 状态码或网络错误码，并在结束时按原因汇总。
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
| POST | `/api/crawl/tasks/:taskId/verification` | 打开人工验证窗口（本机可见 Chrome） |
| DELETE | `/api/crawl/tasks/:taskId/verification` | 取消等待中的人工验证 |
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

`outDir` 必须是 `storage/` 下的相对路径，不传时默认 `images`。命名按黑名单逐段校验（`/` 分隔层级）：

- 允许：空格、括号、中文标点、书名号、emoji、连字符、下划线，以及非结尾的点，例如 `画廊 2024（精选）/插画 · 合集`。
- 拒绝：空段、`.` 与 `..`、控制字符（含 NUL）、反斜杠、段首/段尾的空格与点、Windows 保留名（`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9`，带扩展名也算）、单段超过 255 字节（UTF-8）与整条路径超过 1024 字节（UTF-8）。
- 输入会先做 Unicode NFC 规范化再校验和落盘，避免同形异码出现两个目录；已存在的历史目录保持原名，不会改名。

接口返回的错误信息会指明第几段、违反了哪条规则，并附带可用示例。`pagePattern` 仅在分页模板模式下使用，且必须包含 `{page}`。

### 站点适配器

针对特定站点做隔离适配，通用链路只在入口处解析一次适配器：

- 代码固定在 `backend/src/crawl/adapters/`：`types.ts` 定义契约，`registry.ts` 按数组顺序注册（越靠前优先级越高，默认适配器始终最后），每个站点一个文件。
- 适配器可覆盖：域名/URL 匹配、入口 URL 改写、开抓前准备（Cookie / 登录态 / 代理会话）、页面等待与年龄门点击、滚动与图片收集策略、分页规则、图片下载请求头。
- `CrawlService` 中只有一处 `resolveAdapter()`；未命中任何站点时回落到默认适配器，行为与通用抓取完全一致。
- 代理、Cookie 等敏感或环境相关配置只从环境变量读取，不写进适配器源码。
- 前端“站点预设”下拉数据来自 `GET /api/adapters`，选中后自动填入入口地址与建议参数，并提示该预设需要的额外条件；不选预设时不发送任何额外字段。

`girl-atlas` 需要代理（`GIRL_ATLAS_PROXY` 或 `CRAWL_PROXY_URL`），可选 Cookie（`GIRL_ATLAS_COOKIE`）。未显式配置代理时，macOS 上会自动回退到系统代理（`scutil --proxy`），保证页面抓取与图片下载走同一出口；把 [backend/.env.example](backend/.env.example) 复制为 `backend/.env` 后填写即可；变量含义见下方「环境变量总表」。

### 人工验证（人机校验）

抓取主干内置通用挑战处理：命中人机校验时任务挂起等待，不报错也不傻等超时；前端任务面板出现“需要人工验证”提示卡，展示判定依据、已等待/剩余时长，并提供“打开验证窗口”和“取消任务”。

- **判定**：403/429、标题命中 `Just a moment...` / `请稍候` / `安全验证` 等、页面含 `cf_chl_opt`、`challenge-platform`、`g-recaptcha` 等标记，任一命中即进入等待。判定集中在 `ChallengeDetector`，静态取页、无头取页、分页规划三条路径共用。
- **窗口**：`POST /api/crawl/tasks/:taskId/verification` 在本机拉起正常窗口的 Chrome（`headless: false`），使用独立 profile（`DATA_DIR` 下的 `chrome-verification-profile`，默认 `.data/`，不写入仓库），沿用任务代理与 UA，打开目标地址。
- **继续**：校验通过后沿用这个已通过校验的浏览器上下文继续抓页。实测把 `cf_clearance` 交给独立无头实例仍会被 Cloudflare 重新挑战，因此不做 Cookie 搬运，而是复用同一浏览器会话；任务结束时自动关闭窗口并释放 profile。
- **图片下载**：验证过的站点同样复用该浏览器上下文取图。Cloudflare 的 `cf_clearance` 与浏览器指纹绑定，Node 的 HTTP 客户端即使带上同样的 Cookie/UA 也会被 403，必须走已验证会话；代理、Cookie、UA、Referer 与抓页链路保持一致。
- **失败路径**：超过 `VERIFICATION_TIMEOUT_MS` → `CHALLENGE_TIMEOUT`；用户取消 → `CRAWL_ABORTED`；窗口被关闭 → `CHALLENGE_FAILED`；验证后仍是挑战页 → `CHALLENGE_FAILED`；同一任务最多触发 3 次验证。
- **站点微调**：适配器可通过 `challenge.detect` / `challenge.successSelector` / `challenge.successCookies` / `challenge.verificationUrl` 覆盖或补充通用规则；`detect` 返回 `null` 表示明确不是挑战，返回 `undefined` 则交回通用规则。`girl-atlas` 声明了 `cf_clearance` 与验证入口首页。
- **profile 过期**：启动时清理超过 `VERIFICATION_PROFILE_TTL_MS`（默认 7 天）未使用的 profile。`.data/chrome-verification-profile` 只是本机验证通过的浏览器配置，可安全删除（删后下次抓 girl-atlas 需要重新验证一次）。

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
| `challenge` | `state` / `taskId` / `reason` / `matched` / `timeoutMs` / `waitedMs` | 人工验证状态：`pending` 进入等待，`resolved` 继续抓取，`cancelled` / `timeout` / `window-closed` / `failed` 结束 |
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
| `INVALID_OUT_DIR` | 输出目录为空、绝对路径或不符合命名规则（信息中会指明第几段） |
| `INVALID_PAGINATION` | 结束页小于起始页、页数超过上限 |
| `PAGE_FETCH_FAILED` | 页面请求失败或超时 |
| `HEADLESS_UNAVAILABLE` | Chrome 未安装或启动失败 |
| `DOWNLOAD_FAILED` | 单张图片下载/保存失败（出现在失败明细中） |
| `IMAGE_NOT_FOUND` | 图片不存在或不是受支持的图片 |
| `PATH_OUTSIDE_STORAGE` | 路径越出存储根目录 |
| `STORAGE_ERROR` | 文件系统读写异常 |
| `CHALLENGE_TIMEOUT` | 人工验证超时 |
| `CHALLENGE_FAILED` | 验证窗口关闭、启动失败或验证后仍是挑战页 |
| `CHALLENGE_NOT_PENDING` | 当前任务没有等待中的人工验证 |
| `CRAWL_ABORTED` | 任务被取消 |
| `NOT_FOUND` | 路由不存在 |
| `INTERNAL_ERROR` | 未捕获异常 |

## 配置

环境变量模板就是两份可直接复制的文件，**不要只依赖 shell 里临时 export**：

```bash
cp backend/.env.example backend/.env      # 后端：端口、存储、代理、Cookie 等
cp frontend/.env.example frontend/.env    # 前端：开发服务器代理目标（仓库已带一份默认值）
```

- 优先级：真实进程环境变量 > `backend/.env` > 代码内默认值；`dotenv` 不会覆盖已存在的变量。
- `backend/.env` 已被 `.gitignore` 忽略，`backend/.env.example` 入库；模板中只有占位示例，不要提交真实代理或 Cookie。
- 前端 `frontend/.env` 只含本地开发地址，可安全入库；本地覆盖写 `frontend/.env.local`（已忽略）。

### 环境变量总表

**后端 · 基础配置**

| 变量 | 默认值 | 说明 | 模板 |
| --- | --- | --- | --- |
| `PORT` | `3000` | 监听端口（`scripts/start-dev.sh` 固定用 5678 并让前端代理过来） | [backend/.env.example](backend/.env.example) |
| `STORAGE_DIR` | `<仓库>/storage` | 图片存储根目录，绝对路径 | 同上 |
| `DATA_DIR` | `<仓库>/.data` | 运行态数据目录（人工验证 profile），已忽略 | 同上 |
| `NODE_ENV` | 空 | `production` 时 `/storage` 静态资源缓存 7 天，其它值不缓存 | 同上 |

`npm_package_version` 由包管理器在运行时注入（用于 `/api/system/health` 的版本号），不需要手工配置。

**后端 · 运行调优（可选）**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CHROME_PATH` | 空 | 自定义 Chrome 路径；留空自动探测，探测不到则无头抓取与验证窗口不可用 |
| `VERIFICATION_TIMEOUT_MS` | `300000` | 等待人工校验的超时（毫秒），超时以 `CHALLENGE_TIMEOUT` 结束 |
| `VERIFICATION_PROFILE_TTL_MS` | `604800000` | 验证 profile 保留时长（默认 7 天），过期启动时清理 |

**后端 · 使用 girl-atlas 必须设置**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GIRL_ATLAS_PROXY` | 空 | Girl Atlas 专用代理，优先级最高；与下面两项至少设置一个 |
| `CRAWL_PROXY_URL` | 空 | 通用出站代理（所有适配器可用）；留空时在 macOS 上自动使用系统代理 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 空 | 进程级代理变量，优先级高于系统代理检测；一般由 shell 或代理软件设置，不必写进 `.env` |
| `GIRL_ATLAS_COOKIE` | 空 | 登录态 / 年龄门 Cookie（`name=value; name2=value2`）；留空按访客访问 |

代理格式统一为 `http://主机:端口`，需要认证时写 `http://用户名:密码@主机:端口`。代理与 Cookie 只在启动日志中报告“是否已配置”，不会打印具体值。

**前端**

| 变量 | 默认值 | 说明 | 模板 |
| --- | --- | --- | --- |
| `VITE_API_TARGET` | `http://localhost:5678` | 开发服务器把 `/api`、`/storage` 代理到的后端地址；留空则代理失效 | [frontend/.env.example](frontend/.env.example) |

前端变量只在 Vite 构建配置中读取，不会打包进浏览器代码；若将来要在页面代码中使用，变量名必须带 `VITE_` 前缀。

## 存储约定

- 所有写入都限制在存储根目录内；`outDir` 只接受相对路径，按黑名单拒绝 `..`、绝对路径、控制字符、Windows 保留名等危险名称，其余自然命名（空格、括号、中文标点、emoji）均可用；详见「抓取请求」一节。
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

### 端到端回归脚本

`scripts/e2e/` 下的脚本会自己启动本地静态站点、驱动真实浏览器，并把抓取输出写到 `storage/_e2e-*`。**测试结束（含失败、Ctrl-C）会自动删除这些目录**，不会碰 `storage/` 里的其它图片分组。

```bash
pnpm dev-mac            # 先启动前后端
pnpm e2e:ui             # 默认路径 25 项 UI 断言
pnpm e2e:adapters       # 站点预设 11 项断言
pnpm e2e:girl-atlas     # 人机验证流程（需要后端已配置可用代理）
```

清理逻辑在 `scripts/e2e/lib/test-run.cjs`：只允许删除 `storage/_e2e-*`，启动时还会顺带清理上次异常退出遗留的同名前缀目录；`scripts/e2e/lib/fixture-server.cjs` 负责按需拉起静态站点。

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

### 人工验证

```bash
pnpm --filter backend test
```

- 单测 29 项全部通过：挑战判定（403 / 429 / 标题 / 元素 / 正常页面 / 适配器优先 / `null` 覆盖通用规则 / 无规则回退 / 契约）与验证状态机（`resolved` / `cancelled` / `timeout` / `window-closed` / 重复结算 / 取消后不被超时覆盖）。
- girl-atlas 实测（经 `127.0.0.1:7897` 代理）：
  - 静态请求与无头页面均命中 Cloudflare 挑战，SSE 收到 `challenge` 的 `pending`，前端出现提示卡（含判定依据 `status:403`、倒计时、验证地址、打开/取消按钮）。
  - 点击“打开验证窗口”后本机弹出独立 profile 的 Chrome 窗口（不是日常 Chrome），`POST /api/crawl/tasks/:taskId/verification` 返回 `opened`。
  - 验证窗口内通过校验后，任务自动继续：3 页共发现 89 个图片地址，保存 88 张（1 张站点广告雪碧图超时），任务结束后验证窗口自动关闭。
  - 对照实验：把 `cf_clearance` 注入独立无头实例会被再次挑战，因此继续抓取复用的是验证窗口的浏览器上下文（代码见 `HumanVerificationService.getVerifiedPage`）。
  - 站点适配器等待选择器按真实 DOM 修正为 `.main-content, .card`，并补充 `#adult-18-modal button` 年龄门点击。
- 人工验证接入后默认路径回归仍为 25/25。

## 提交规范

Husky + Commitlint（Conventional Commits）。`pre-commit` 会执行前后端 ESLint，`commit-msg` 校验提交信息。

## License

UNLICENSED
