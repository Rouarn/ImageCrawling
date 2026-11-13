# Frontend · Image Crawler

React 19 + Vite 8 + TypeScript。Ant Design 负责交互组件，Tailwind CSS 4 负责布局与品牌样式，TanStack Query 管理服务端状态，Zustand 管理客户端状态。

## 目录

```
src/
├── api/            契约类型、Axios 客户端、SSE 解析
├── app/            路由、主题、QueryClient、全局任务监听
├── components/
│   ├── layout/     侧栏 / 移动端导航 / 应用壳
│   └── ui/         Panel、Badge、StatTile、EmptyState、Skeleton
├── features/
│   ├── crawl/      表单、任务控制台、日志、指标
│   ├── library/    工具栏、分组筛选、图片卡片/网格、批量选择
│   └── system/     健康检查
├── pages/          页面组合
├── stores/         主题、全局抓取任务
├── lib/            格式化、通知、className
└── styles/         设计令牌与全局样式
```

## 数据层

- `api/client.ts`：Axios 实例、`{ success, data }` 解包、`ApiError` 统一错误（含 `code` / `status` / `requestId`）。
- `api/crawl.ts`：`fetch` + `ReadableStream` 消费 SSE，支持 `AbortController` 取消；非 2xx 会解析统一错误体。
- `features/*/queries.ts`：React Query 查询键与变更，删除后自动失效图片列表与分组缓存。
- `stores/crawl-task-store.ts`：全局任务状态机（idle / running / completed / failed / cancelled），日志与指标由 SSE 事件驱动，切换页面不中断任务。

## 设计系统

- 语义化 CSS 变量：`--canvas`、`--surface`、`--line`、`--ink`、`--accent` 等，浅色/深色两套在 `styles/index.css` 统一定义。
- Ant Design 主题在 `app/antd-theme.ts` 中映射同一套色板与圆角、字体。
- 布局：桌面固定侧栏 + 内容区；窄屏顶部品牌栏 + 底部标签栏，内容区预留安全区。
- 交互：任务控制台实时进度与日志、图片灯箱预览、多选批量删除、复制链接。

## 命令

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend lint
```

开发代理读取 `VITE_API_TARGET`（默认 `http://localhost:5678`），同时代理 `/api` 与 `/storage`。
