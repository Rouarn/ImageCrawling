# Backend · Image Crawler

NestJS 11 + TypeScript，负责抓取编排、HTML 解析、无头渲染、图片下载与图片库查询。

- 架构与抓取链路：[docs/architecture.md](../docs/architecture.md)
- 接口与事件：[docs/api.md](../docs/api.md)
- 适配器：[docs/adapters.md](../docs/adapters.md)
- 代理与人工验证：[docs/proxy-and-verification.md](../docs/proxy-and-verification.md)
- 配置与部署：[docs/deployment.md](../docs/deployment.md)

## 命令

```bash
pnpm --filter backend start:dev
pnpm --filter backend build
pnpm --filter backend lint
pnpm --filter backend test
```

## 约定

- 所有文件系统路径必须经过 `StorageService`，越界直接返回 `PATH_OUTSIDE_STORAGE`。
- 新增错误场景先补充 `ErrorCode`，再抛 `AppException`。
- 新增接口统一使用 DTO 校验与 Swagger 装饰器。
- 新增站点适配器只在 `crawl/adapters/` 下建文件并追加到 `REGISTERED_ADAPTERS`；敏感配置通过 `AdapterConfig.get()` 读环境变量。
- 验证 profile 默认位于 `data/browser/chrome-verification-profile`，不进入仓库。
