# 测试与 E2E

## 静态检查与单元测试

```bash
pnpm --filter backend lint
pnpm --filter backend build
pnpm --filter backend test
pnpm --filter frontend lint
pnpm --filter frontend build
```

后端单测通过 `node --test` 运行 `src/**/*.spec.ts`，覆盖：

- 适配器契约：域名匹配、未匹配回退默认适配器、非法 URL 回退、注册顺序优先级、预设接口字段、默认适配器运行时零副作用、girl-atlas 入口改写 / 代理 / Cookie / 分页解析。
- 挑战判定：403 / 429 / 标题 / 元素 / 正常页面 / 适配器优先 / `null` 覆盖通用规则 / 无规则回退。
- 验证状态机：`resolved` / `cancelled` / `timeout` / `window-closed` / 重复结算 / 取消后不被超时覆盖。
- 存储路径校验与图片库 Repository（临时目录，不触碰 `data/library/`）。

## 端到端回归

前置：先启动前后端。

```bash
pnpm dev-mac
```

另开终端：

```bash
pnpm e2e:ui             # 默认路径 UI 回归
pnpm e2e:adapters       # 站点预设 UI 回归
pnpm e2e:girl-atlas     # 人机验证流程（需要后端已配置可用代理）
```

`scripts/e2e/` 下的脚本会自己启动本地静态站点、驱动真实浏览器，并把抓取输出写到 `data/library/_e2e-*`。**测试结束（含失败、Ctrl-C）会自动删除这些目录**，不会碰 `data/library/` 里的其它图片分组。

清理逻辑在 `scripts/e2e/lib/test-run.cjs`：只允许删除 `data/library/_e2e-*`，启动时还会顺带清理上次异常退出遗留的同名前缀目录；`scripts/e2e/lib/fixture-server.cjs` 负责按需拉起静态站点。

## UI 回归覆盖

- 首页渲染、侧边栏导航、URL 自动推导输出目录、保留名规避、手动目录不被覆盖。
- 抓取成功后的完成提示（总数而非单次计数）、日志分页规划/发现数量/下载开始/完成汇总、状态徽标。
- 一键复制全部日志：取 store 全量（含已滚出视口的历史行），按 `[时间] 级别 内容` 格式校验。
- 图片库分组筛选、搜索、分页、灯箱预览、单张与批量删除。
- 错误路径（`PAGE_FETCH_FAILED`）与控制台清空。
- 深色/浅色主题切换。
- 移动端无横向溢出、底部导航可见、表单可用。
- 运行期间浏览器控制台无错误。

## 站点预设回归覆盖

- 下拉出现、包含 Girl Atlas、选中后自动填入入口 URL、输出目录推导、建议页数、条件提示（代理 / Cloudflare / Cookie 变量名）、无头模式自动开启、清除预设后恢复通用模式。

## 人机验证回归

`pnpm e2e:girl-atlas` 断言提示卡出现 → 打开验证窗口 → 任务继续并完成。该用例依赖外部站点与可用代理，失败时先检查后端启动日志中的代理状态。

## 浏览器扩展回归

```bash
pnpm extension:build

# 另开终端，用固定令牌启动后端
IMPORT_TOKEN=e2e-token PORT=5678 pnpm --filter backend start

pnpm e2e:extension
```

脚本会加载 `packages/extension/dist/`：优先通过 CDP 的 `Extensions.loadUnpacked` 加载（正式版 Chrome 137+ 已忽略 `--load-extension`），不支持时回退到 `--load-extension`（Edge 等 Chromium 系浏览器），也可用 `E2E_BROWSER_PATH` 指定浏览器。它会启动本地 fixture 页面，把采集结果存入 `data/library/_e2e-extension`，覆盖：

- 普通 `img`、`srcset`、懒加载 `data-src`、`picture`、内联背景、样式表背景，以及 800ms 后插入的图片；
- 最小尺寸筛选、全选计数；
- 7 个 URL 按内容哈希只写入 3 个文件；
- 图片库接口能看到新分组；
- 第二次保存全部命中重复，文件数不变。

结束时会删除 `_e2e-extension` 目录；截图默认写到系统临时目录，可用 `E2E_SHOT_DIR` 指定。

## 相关文档

- [架构与分层](architecture.md)
- [API 契约](api.md)
- [浏览器扩展](extension.md)
- [站点适配器](adapters.md)
- [代理与人工验证](proxy-and-verification.md)
- [部署](deployment.md)
