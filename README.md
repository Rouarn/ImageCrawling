# 图片抓取台 · 快速开始

个人自用的网络图片抓取工具。前后端同仓（pnpm workspace）：后端负责抓取、解析与文件存储，前端提供任务控制台和图片库；另有 Chrome 扩展，可在已渲染的页面上挑选图片直接存入图片库。

## 快速开始

```bash
pnpm install
pnpm dev-mac
```

- 前端：http://localhost:5173
- 后端：http://localhost:5678/api
- Swagger：http://localhost:5678/api/docs

Windows 使用 `pnpm dev`（PowerShell 脚本），两个入口都调用 `scripts/dev/` 下的启动脚本。

也可以分别启动：

```bash
pnpm --filter backend start:dev
```

```bash
VITE_API_TARGET=http://127.0.0.1:3000 pnpm --filter frontend dev
```

后端默认端口 `3000`；`scripts/dev/start-dev.sh` 固定用 `5678`，并让前端代理到该端口。

运行时数据全部在 `data/`（已 git 忽略）：抓取产物写入 `data/library/`，人工验证的 Chrome profile 在 `data/browser/`。首次运行会自动创建。

使用浏览器扩展时，还需在 `packages/backend/.env` 配置 `IMPORT_TOKEN`，并构建扩展：

```bash
pnpm extension:build   # 一次性构建
pnpm extension:watch   # 监听源码自动重建，Ctrl+C 退出
```

然后在 `chrome://extensions/` 开启开发者模式，加载 `packages/extension/dist/`。详见[浏览器扩展](docs/extension.md)。

## 目录结构

```
.
├── packages/
│   ├── backend/      NestJS API：抓取、解析、下载、图片库
│   ├── frontend/     React 控制台与图片库
│   └── extension/    Chrome MV3 扩展（本地加载，产物在 dist/）
├── scripts/
│   ├── dev/          启动脚本（macOS / Windows）
│   └── e2e/          端到端套件与 fixture
├── docs/             架构、API、适配器、代理与验证、测试、部署
├── data/             运行时数据（全部 git 忽略）
│   ├── library/      抓取产物
│   └── browser/      验证用 Chrome profile
├── README.md
└── .husky/ package.json pnpm-workspace.yaml commitlint.config.js
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev-mac` / `pnpm dev` | 同时启动前后端（macOS / Windows） |
| `pnpm --filter backend test` | 后端单元测试 |
| `pnpm e2e:ui` | UI 回归（需先启动前后端） |
| `pnpm e2e:adapters` | 站点预设回归（需先启动前后端） |
| `pnpm extension:build` | 构建扩展到 `packages/extension/dist/` |
| `pnpm extension:watch` | 监听扩展源码自动重建（`Ctrl+C` 退出） |
| `pnpm e2e:extension` | 扩展端到端（需先构建扩展并带令牌启动后端） |

## 文档

- [架构与分层](docs/architecture.md)
- [API 契约](docs/api.md)
- [浏览器扩展](docs/extension.md)
- [站点适配器](docs/adapters.md)
- [代理与人工验证](docs/proxy-and-verification.md)
- [测试与 E2E](docs/testing.md)
- [部署](docs/deployment.md)

## License

UNLICENSED
