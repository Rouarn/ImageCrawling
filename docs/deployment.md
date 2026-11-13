# 部署

面向本机或单机服务器部署。项目不需要数据库，运行时数据只有 `data/` 目录。

## 环境要求

- Node.js 20+（与依赖版本匹配即可）
- pnpm 10（`packageManager` 已锁定版本）
- Chrome / Chromium：无头抓取与人工验证窗口需要；留空 `CHROME_PATH` 时自动探测系统安装位置与 Puppeteer 缓存

## 构建

```bash
pnpm install
pnpm --filter backend build      # 产物：packages/backend/dist
pnpm --filter frontend build     # 产物：packages/frontend/dist
```

## 启动

```bash
PORT=5678 pnpm --filter backend start:prod
```

或直接运行构建产物：

```bash
PORT=5678 node packages/backend/dist/main.js
```

前端是纯静态文件，用任意静态服务器托管 `packages/frontend/dist`，并把 `/api` 与 `/media` 反向代理到后端。Nginx 示例：

```nginx
server {
  listen 80;
  root /path/to/image-crawling/packages/frontend/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:5678;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_buffering off;          # SSE 必须关闭缓冲
    proxy_read_timeout 600s;
  }

  location /media/ {
    proxy_pass http://127.0.0.1:5678;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

`/media` 是后端静态图片路由，指向存储根目录 `data/library/`。`NODE_ENV=production` 时该路由返回 7 天缓存，其它值不缓存。

## 运行时目录

| 路径 | 用途 | 是否入库 |
| --- | --- | --- |
| `data/library/` | 抓取产物，图片库读取的存储根目录 | 否（`/data/` 已忽略） |
| `data/browser/chrome-verification-profile/` | 人工验证的独立 Chrome profile | 否 |

两者首次运行会自动创建。备份只需要备份 `data/library/`；profile 可以重新验证生成。

## 配置来源

```bash
cp packages/backend/.env.example packages/backend/.env    # 后端：端口、存储、代理、Cookie
cp packages/frontend/.env.example packages/frontend/.env  # 前端：开发代理目标（仓库已带默认值）
```

优先级：真实进程环境变量 > `packages/backend/.env` > 代码内默认值。`packages/backend/.env` 与 `packages/frontend/.env.local` 已被忽略，模板可以入库。

## 环境变量总表

**后端 · 基础配置**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口（开发脚本固定 5678） |
| `STORAGE_DIR` | `<仓库>/data/library` | 图片存储根目录，绝对路径 |
| `DATA_DIR` | `<仓库>/data/browser` | 运行态数据目录（人工验证 profile） |
| `NODE_ENV` | 空 | `production` 时 `/media` 静态资源缓存 7 天 |

`npm_package_version` 由包管理器在运行时注入（用于 `/api/system/health` 的版本号），不需要手工配置。

**后端 · 运行调优（可选）**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址；默认只听本机，改成 `0.0.0.0` 会暴露到局域网 |
| `IMPORT_TOKEN` | 空 | 浏览器扩展导入令牌；未配置时导入接口返回 503 |
| `CHROME_PATH` | 空 | 自定义 Chrome 路径；留空自动探测 |
| `VERIFICATION_TIMEOUT_MS` | `300000` | 等待人工校验的超时（毫秒） |
| `VERIFICATION_PROFILE_TTL_MS` | `604800000` | 验证 profile 保留时长（默认 7 天） |

**后端 · 代理与站点凭据（可选）**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GIRL_ATLAS_PROXY` | 空 | Girl Atlas 专用代理，优先级最高 |
| `CRAWL_PROXY_URL` | 空 | 通用出站代理；留空时 macOS 自动使用系统代理 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 空 | 进程级代理变量，优先级高于系统代理检测 |
| `GIRL_ATLAS_COOKIE` | 空 | 登录态 / 年龄门 Cookie |

代理格式统一为 `http://主机:端口`，需要认证时写 `http://用户名:密码@主机:端口`。代理与 Cookie 只在启动日志中报告“是否已配置”，不会打印具体值。优先级与人工验证细节见[代理与人工验证](proxy-and-verification.md)。

**前端**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_TARGET` | `http://127.0.0.1:5678` | 开发服务器把 `/api`、`/media` 代理到的后端地址；仅开发模式使用 |

生产部署时前端由静态服务器托管，`/api` 与 `/media` 的转发由反向代理负责，不依赖 `VITE_API_TARGET`。

## 健康检查

```bash
curl http://localhost:5678/api/system/health
```

返回服务状态、版本、存储根目录是否可写，以及无头浏览器是否可用（`headless.available`）。部署后先确认 `storage.root` 指向预期的 `data/library`。

## 相关文档

- [架构与分层](architecture.md)
- [API 契约](api.md)
- [浏览器扩展](extension.md)
- [站点适配器](adapters.md)
- [代理与人工验证](proxy-and-verification.md)
- [测试与 E2E](testing.md)
