# 站点适配器

针对特定站点做隔离适配，通用链路只在入口处解析一次适配器。

## 代码结构

- 固定在 `backend/src/crawl/adapters/`：`types.ts` 定义契约，`registry.ts` 按数组顺序注册（越靠前优先级越高，默认适配器始终最后），每个站点一个文件。
- 适配器可覆盖：域名/URL 匹配、入口 URL 改写、开抓前准备（Cookie / 登录态 / 代理会话）、页面等待与年龄门点击、滚动与图片收集策略、分页规则、图片下载请求头。
- `CrawlService` 中只有一处 `resolveAdapter()`；未命中任何站点时回落到默认适配器，行为与通用抓取完全一致。
- 代理、Cookie 等敏感或环境相关配置只从环境变量读取，不写进适配器源码。

## 新增一个站点适配器

1. 在 `crawl/adapters/` 下新建站点文件，实现 `SiteAdapter` 契约（`types.ts`）。
2. 追加到 `registry.ts` 的 `REGISTERED_ADAPTERS`，注意顺序即优先级。
3. 敏感配置通过 `AdapterConfig.get()` 读环境变量，并补进 `backend/.env.example`。
4. 在 `adapters.spec.ts` 补契约断言：匹配、回退、优先级、入口改写、代理/Cookie 行为。
5. 前端“站点预设”下拉会自动出现，数据来自 `GET /api/adapters`。

不要在 `CrawlService` 里按域名分支；挑战判定差异只写 `adapter.challenge`。

## 前端站点预设

`GET /api/adapters` 返回预设列表。选中后自动填入入口地址与建议参数，并提示该预设需要的额外条件；不选预设时不发送任何额外字段。

## 内置适配器

### girl-atlas

- 入口：`https://www.girl-atlas.com/`，专辑页按分页规则收集图片。
- 代理：需要 `GIRL_ATLAS_PROXY` 或 `CRAWL_PROXY_URL`；都未配置时回退 macOS 系统代理。站点在本机 DNS 可能被污染，没有可用代理时页面与图片都会失败。
- Cookie：可选 `GIRL_ATLAS_COOKIE`，用于登录态或 18+ 年龄门。
- 挑战：声明 `cf_clearance` 与验证入口首页，命中 Cloudflare 后进入人工验证流程，详见[代理与人工验证](proxy-and-verification.md)。
- 页面等待选择器按真实 DOM 为 `.main-content, .card`，并补充 `#adult-18-modal button` 年龄门点击。

变量含义与代理优先级见[代理与人工验证](proxy-and-verification.md)和[部署](deployment.md#环境变量总表)。

## 回归

```bash
pnpm --filter backend test    # 适配器契约单测
pnpm e2e:adapters             # 前端预设 UI 回归（需先启动前后端）
```

## 相关文档

- [架构与分层](architecture.md)
- [API 契约](api.md)
- [代理与人工验证](proxy-and-verification.md)
- [测试与 E2E](testing.md)
- [部署](deployment.md)
