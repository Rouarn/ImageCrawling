/* eslint-disable react-refresh/only-export-components -- 路由模块只负责注册懒加载页面 */
import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import AppShell from '@/components/layout/app-shell';

const CrawlPage = lazy(() => import('@/pages/crawl-page'));
const LibraryPage = lazy(() => import('@/pages/library-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: CrawlPage },
      { path: 'library', Component: LibraryPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
];

const router = createBrowserRouter(routes);

export default router;
