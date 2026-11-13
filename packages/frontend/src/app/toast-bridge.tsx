import { useEffect } from 'react';
import { App } from 'antd';
import { registerAntdApi } from '@/lib/notify';

/**
 * 把 App.useApp() 的实例注册到全局，供非组件代码（如数据层）使用。
 */
export function ToastBridge(): null {
  const api = App.useApp();

  useEffect(() => {
    registerAntdApi(api);
  }, [api]);

  return null;
}
