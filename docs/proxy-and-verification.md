# 代理与人工验证

代理用于两件事：让页面能加载（站点可能被 DNS 污染或需要翻墙），以及让图片下载和抓页走同一出口。人工验证用于 Cloudflare 等挑战页。

## 代理优先级

后端按以下顺序确定出站代理（`AppConfigService` 启动时解析一次）：

1. `GIRL_ATLAS_PROXY`（仅 girl-atlas 适配器使用）
2. `CRAWL_PROXY_URL`
3. `HTTPS_PROXY` / `HTTP_PROXY`（进程环境变量）
4. macOS 系统代理（`scutil --proxy` 自动探测）

格式统一为 `http://主机:端口`，需要认证时写 `http://用户名:密码@主机:端口`。

> **为什么还要探测系统代理**：无头 Chrome 默认走系统代理，Node 的 HTTP 客户端不会。只配系统代理时，如果后端不主动读取，抓页能成功而图片下载会落到裸 HTTP 客户端上直接失败。启动日志只报告“是否启用/来源变量名”，不会输出代理地址。

## 人工验证（人机校验）

抓取主干内置通用挑战处理：命中人机校验时任务挂起等待，不报错也不傻等超时；前端任务面板出现“需要人工验证”提示卡，展示判定依据、已等待/剩余时长，并提供“打开验证窗口”和“取消任务”。

- **判定**：403/429、标题命中 `Just a moment...` / `请稍候` / `安全验证` 等、页面含 `cf_chl_opt`、`challenge-platform`、`g-recaptcha` 等标记，任一命中即进入等待。判定集中在 `ChallengeDetector`，静态取页、无头取页、分页规划三条路径共用。
- **窗口**：`POST /api/crawl/tasks/:taskId/verification` 在本机拉起正常窗口的 Chrome（`headless: false`），使用独立 profile（`DATA_DIR/chrome-verification-profile`，默认 `data/browser/chrome-verification-profile`，不写入仓库），沿用任务代理与 UA，打开目标地址。
- **继续**：校验通过后沿用这个已通过校验的浏览器上下文继续抓页。实测把 `cf_clearance` 交给独立无头实例仍会被 Cloudflare 重新挑战，因此不做 Cookie 搬运，而是复用同一浏览器会话；任务结束时自动关闭窗口并释放 profile。
- **图片下载**：验证过的站点同样复用该浏览器上下文取图。Cloudflare 的 `cf_clearance` 与浏览器指纹绑定，Node 的 HTTP 客户端即使带上同样的 Cookie/UA 也会被 403，必须走已验证会话；代理、Cookie、UA、Referer 与抓页链路保持一致。单图失败会记录 HTTP 状态码或网络错误码，任务结束时按原因汇总。
- **失败路径**：超过 `VERIFICATION_TIMEOUT_MS` → `CHALLENGE_TIMEOUT`；用户取消 → `CRAWL_ABORTED`；窗口被关闭 → `CHALLENGE_FAILED`；验证后仍是挑战页 → `CHALLENGE_FAILED`；同一任务最多触发 3 次验证。
- **站点微调**：适配器可通过 `challenge.detect` / `challenge.successSelector` / `challenge.successCookies` / `challenge.verificationUrl` 覆盖或补充通用规则；`detect` 返回 `null` 表示明确不是挑战，返回 `undefined` 则交回通用规则。girl-atlas 声明了 `cf_clearance` 与验证入口首页。
- **profile 过期**：启动时清理超过 `VERIFICATION_PROFILE_TTL_MS`（默认 7 天）未使用的 profile。`data/browser/chrome-verification-profile` 只是本机验证通过的浏览器配置，可安全删除（删后下次抓 girl-atlas 需要重新验证一次）。

## 相关配置

| 变量 | 说明 |
| --- | --- |
| `GIRL_ATLAS_PROXY` | Girl Atlas 专用代理，优先级最高 |
| `CRAWL_PROXY_URL` | 通用出站代理 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 进程级代理，一般由 shell 或代理软件设置 |
| `GIRL_ATLAS_COOKIE` | 登录态 / 年龄门 Cookie（`name=value; name2=value2`） |
| `VERIFICATION_TIMEOUT_MS` | 等待人工校验的超时，默认 300000 |
| `VERIFICATION_PROFILE_TTL_MS` | 验证 profile 保留时长，默认 604800000（7 天） |
| `DATA_DIR` | 运行态数据目录，默认 `<仓库>/data/browser` |

完整表格见[部署 · 环境变量总表](deployment.md#环境变量总表)。

## 相关文档

- [架构与分层](architecture.md)
- [站点适配器](adapters.md)
- [测试与 E2E](testing.md)
- [部署](deployment.md)
