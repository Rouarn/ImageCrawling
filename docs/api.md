# API 契约

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

启动后访问 `http://localhost:5678/api/docs` 查看 Swagger，`/api/docs-json` 获取 OpenAPI JSON。

## REST 接口

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

静态图片资源挂在 `/media/` 下，对应存储根目录 `data/library/`；开发环境不缓存，`NODE_ENV=production` 时缓存 7 天。

## 抓取请求

`POST /api/crawl/stream` 的 body：

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

`outDir` 必须是 `data/library/` 下的相对路径，不传时默认 `images`。命名按黑名单逐段校验（`/` 分隔层级）：

- 允许：空格、括号、中文标点、书名号、emoji、连字符、下划线，以及非结尾的点，例如 `画廊 2024（精选）/插画 · 合集`。
- 拒绝：空段、`.` 与 `..`、控制字符（含 NUL）、反斜杠、段首/段尾的空格与点、Windows 保留名（`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9`，带扩展名也算）、单段超过 255 字节（UTF-8）与整条路径超过 1024 字节（UTF-8）。
- 输入会先做 Unicode NFC 规范化再校验和落盘，避免同形异码出现两个目录；已存在的历史目录保持原名，不会改名。

接口返回的错误信息会指明第几段、违反了哪条规则，并附带可用示例。`pagePattern` 仅在分页模板模式下使用，且必须包含 `{page}`。

## SSE 事件

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

## 错误码

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

## 相关文档

- [架构与分层](architecture.md)
- [站点适配器](adapters.md)
- [代理与人工验证](proxy-and-verification.md)
- [测试与 E2E](testing.md)
- [部署](deployment.md)
