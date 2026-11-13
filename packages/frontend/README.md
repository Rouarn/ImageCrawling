# Frontend · Image Crawler

React 19 + Vite 8 + TypeScript。Ant Design 负责交互组件，Tailwind CSS 4 负责布局与品牌样式，TanStack Query 管理服务端状态，Zustand 管理客户端状态。

- 分层与数据流：[docs/architecture.md](../docs/architecture.md)
- 接口契约：[docs/api.md](../docs/api.md)
- 前端开发代理与部署：[docs/deployment.md](../docs/deployment.md)

## 命令

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend lint
```

## 配置

```bash
cp packages/frontend/.env.example packages/frontend/.env   # 仓库已带默认值，按需修改
```

- `VITE_API_TARGET`：开发服务器把 `/api`、`/media` 代理到的后端地址，默认 `http://127.0.0.1:5678`。
- 该变量只在 `vite.config.ts` 中读取，不会打包进浏览器代码。
- 本地私有覆盖写入 `packages/frontend/.env.local`（已忽略）。
