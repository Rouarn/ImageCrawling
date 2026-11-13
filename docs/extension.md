# 浏览器扩展

Chrome MV3 扩展，用于在已经渲染好的图片页面上挑选图片，直接存入本地图片库或下载到磁盘。只做「从当前页面采集」，不做自动化点击 / 滚动，也不代替后端抓取任务。

## 构建与加载

```bash
pnpm extension:build   # 一次性构建
pnpm extension:watch   # 监听 src/，改动后自动重建
```

产物在 `packages/extension/dist/`，是一个可直接加载的完整扩展目录。

1. 打开 `chrome://extensions/`，右上角开启「开发者模式」。
2. 点「加载已解压的扩展程序」，选择 `packages/extension/dist/`。
3. 改完源码后：`watch` 会自动把 `dist/` 更新好，但 Chrome 不会自动重载，需要回到扩展页点该扩展的刷新按钮；改动涉及 content script 时，已打开的页面还要再刷新一次才会注入新脚本。

`watch` 的行为：

- 监听 `src/` 下全部文件（含 `manifest.json`、弹窗/设置页 HTML），每次变更后打印变更文件与重建耗时。
- 源码有语法错误时打印 `文件:行:列` 与出错行，进程保持运行；修好后自动重建。
- 静态文件（manifest、HTML）会被同步复制到 `dist/`，不会只重建 JS。
- `Ctrl+C` 停止监听。

不做商店上架，没有打包 zip / 签名步骤。

## 配置

### 后端

在 `packages/backend/.env` 中配置导入令牌（参考 `.env.example`）：

```bash
IMPORT_TOKEN=用 openssl rand -hex 24 生成的令牌
```

- 未配置时，导入接口返回 `503`，扩展会提示先配置。
- 后端默认只监听 `127.0.0.1`；`HOST` 只在确有需要时才修改，改成 `0.0.0.0` 会暴露到局域网。
- 修改 `.env` 后重启后端。

### 扩展

打开扩展的「设置」页（面板右上角「设置」，或扩展详情里的「扩展程序选项」）：

- **后端地址**：默认 `http://127.0.0.1:5678`，与 `pnpm dev-mac` 一致。
- **导入令牌**：与后端 `IMPORT_TOKEN` 完全相同。
- 点「测试连接」会请求 `GET /api/import/status`，成功时显示后端实际使用的存储目录。

令牌只保存在本机浏览器的 `chrome.storage.local`，不进入同步空间。

## 两种入口

同一套面板 UI，数据来自同一个 content script 采集器：

- **页内浮层**：右下角胶囊「发现 N 张」→ 展开面板；收起后胶囊保留。
- **扩展弹窗**：点工具栏扩展图标，看到同一份列表。弹窗把操作转交给当前标签页的 content script，弹窗关闭不会中断已经开始的上传。

两种入口的选择、筛选状态互相独立，采集结果是同一份。

## 采集覆盖

| 来源 | 处理方式 |
| --- | --- |
| `<img src>` | 直接采集 |
| `<img currentSrc>` | 在 `srcset` 生效后取浏览器选中的地址 |
| `<img srcset>` | 解析所有候选，取尺寸/倍率最大的一张，避免同一张图重复 |
| `<picture>` | 由内部 `<img>` 覆盖；没有 `<img>` 时取 `<source srcset>` 最大候选 |
| 懒加载属性 | `data-src`、`data-original`、`data-lazy-src`、`data-echo`、`data-url`、`data-actualsrc`、`data-srcset` 等常见写法；存在懒加载属性时优先用真实地址，跳过占位 `src` |
| CSS 背景图 | 内联 `style` 与样式表计算后的 `background-image`（`url(...)`，多个背景都会拆出来） |
| 增量内容 | `MutationObserver` 监听新增节点与属性变化，页面自己加载/插入的图片会自动补进列表 |

格式优先按 URL 扩展名识别，兼容站点在扩展名后追加处理标记的写法（例如 girl-atlas 的 `photo.jpg!lrg` 会识别为 JPG）；识别不出的显示「未知」，可用「其它」筛选。

明确不处理：

- 不滚动页面、不点击「加载更多」，懒加载只识别页面已经产生的 DOM。
- 不进入 iframe（content script 只跑在主框架）。
- 不处理 `data:` / `blob:` 地址、`<video poster>`、`canvas`、伪元素 `::before/::after` 的背景图。
- 采集不进入页面 JS 的 MAIN world，拿不到 `window` 上挂着的图片数据。

图片尺寸通过创建临时 `Image` 探测；探测失败或超时的图片会标记「尺寸未知」，选择 ≥ 某尺寸筛选时被排除，但仍可手动勾选。

## 面板功能

- 图片网格、逐张勾选、全选 / 反选 / 清空（全选与反选只作用于当前筛选结果）。
- 按最小宽度（400 / 800 / 1200 / 1600 / 2000px）与格式（JPG / PNG / WebP / GIF / AVIF / SVG / 其它）过滤；工具栏显示「显示 X / 共 M」。
- 底部实时「已选 N / 共 M」。
- 分组名默认取页面标题，标题为空时退回域名；也可以手动输入或点「页面标题 / 域名」快速填入。
- 主按钮「存入图片库」，次按钮「下载到磁盘」；处理中禁用按钮并显示进度条。

## 上传与去重

保存流程：content script 先 `fetch(url, { credentials: 'include' })` 在页面上下文取字节（带页面 Cookie）；跨域被拒或超时时，交给后台 service worker 带扩展权限重试。字节统一以 `application/octet-stream` 发送到：

```
POST /api/import/image?group=<分组>&name=<原始文件名>&sourceUrl=<页面地址>
Header: x-import-token: <令牌>
```

后端处理：

- 校验请求来自本机回环地址、令牌匹配、请求体是图片文件头（JPG/PNG/GIF/WebP/BMP/SVG/AVIF/HEIC/TIFF/ICO）。
- 计算内容 SHA-256，在**目标分组内**查找相同哈希；命中则不再写入，返回 `duplicate: true`。
- 未命中写入 `data/library/<分组>/<hash前16位>-<安全原名>.<真实扩展名>`。
- 去重范围是单个分组：不同分组各自保存相同内容，避免打乱分组整理。
- 文件名中的路径、控制字符与 `: * ? " < > |` 会被替换为 `-`，长度截断到 60 字符。

面板结果会显示「共 N 张：新增 X，重复 Y，失败 Z」，命中重复时同样计入总数，避免「看起来少了几张」。

## 失败可见

- 单张失败会标红并在结果区列出文件名与原因，例如 `HTTP 403 Forbidden`、`页面取图失败（网络错误（跨域被拒或连接失败））；后台重试失败（HTTP 403）`、后端返回的具体错误消息。
- 结果区固定显示成功、重复、失败三个计数。
- 后端未启动、令牌缺失或令牌错误时，显示明确提示与「打开扩展设置」按钮。

## 下载到磁盘

下载由 service worker 调用 `chrome.downloads.download`，文件名沿用原文件名（冲突自动加后缀）。浏览器拒绝的地址会逐张返回原因；可在 Chrome 下载记录里查看结果。

## 安全边界

- content script 只运行在 isolated world，不向页面注入远程脚本、不修改页面全局样式和原型。
- 面板与胶囊全部放在 shadow DOM 内，只使用 constructable stylesheet 或 `<style>`，页面 CSS 不会影响面板，面板样式也不会泄漏到页面。
- 导入接口要求令牌，并只接受本机回环请求；令牌错误返回 `401`，未配置返回 `503`。
- 单次请求体上限 25MB。
- 扩展权限：`storage`、`downloads`，以及 `http/https` 的 host 权限（用于内容脚本与后台取图）。

## 验证

```bash
pnpm extension:build

# 另开终端：带令牌启动后端
IMPORT_TOKEN=e2e-token PORT=5678 pnpm --filter backend start

pnpm e2e:extension
```

`scripts/e2e/extension.cjs` 会启动本地 fixture 页面（普通图、`srcset`、懒加载、`picture`、内联/样式表背景、800ms 后插入的新图），加载扩展、勾选、存入 `data/library/_e2e-extension`，并验证：

- 采集数量 ≥ 7，增量插入的图片也在列表里；
- 最小尺寸筛选生效；
- 7 个 URL 按内容哈希只写入 3 个文件；
- 图片库接口能看到新分组；
- 第二次保存全部命中重复，文件数不变。

测试结束会删除 `_e2e-extension` 目录。截图默认写到系统临时目录，可用 `E2E_SHOT_DIR` 指定。

关于自动化环境：Chrome 137 起，正式版 Chrome 会忽略 `--load-extension`。脚本因此先不带该参数启动，通过 CDP 的 `Extensions.loadUnpacked`（需要 `--enable-unsafe-extension-debugging`）加载扩展；如果当前浏览器不支持 CDP 加载，再用 `--load-extension` 重启（Edge 等 Chromium 系浏览器仍支持），也可用 `E2E_BROWSER_PATH` 指定浏览器。日常手动使用不受影响，仍然是在 `chrome://extensions` 里加载已解压目录。

girl-atlas 这类有 Cloudflare 人机校验的站点，自动化脚本直接导航容易被判定为机器人。实测时用正常方式启动浏览器（不接管导航）打开页面、通过校验后，再连接 CDP 操作扩展面板；扩展不负责绕过校验，也不自动点击或滚动。

## 相关文档

- [API 契约](api.md)
- [架构与分层](architecture.md)
- [测试与 E2E](testing.md)
- [部署](deployment.md)
