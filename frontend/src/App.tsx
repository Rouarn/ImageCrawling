import { useEffect } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';
import router from '@/app/router';
import { buildAntdTheme } from '@/app/antd-theme';
import { queryClient } from '@/app/query-client';
import { ToastBridge } from '@/app/toast-bridge';
import { CrawlTaskWatcher } from '@/app/crawl-task-watcher';
import { useIsDarkMode } from '@/stores/theme-store';

const App: React.FC = () => {
  const isDark = useIsDarkMode();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <QueryClientProvider client={queryClient}>
      <StyleProvider hashPriority="high">
        <ConfigProvider locale={zhCN} theme={buildAntdTheme(isDark)}>
          <AntdApp>
            <ToastBridge />
            <CrawlTaskWatcher />
            <RouterProvider router={router} />
          </AntdApp>
        </ConfigProvider>
      </StyleProvider>
    </QueryClientProvider>
  );
};

export default App;
