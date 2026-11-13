import type { App } from 'antd';

type AntdAppApi = ReturnType<typeof App.useApp>;

let antdApi: AntdAppApi | null = null;

export function registerAntdApi(api: AntdAppApi): void {
  antdApi = api;
}

export const notify = {
  success(content: string): void {
    void antdApi?.message.success(content);
  },
  error(content: string): void {
    void antdApi?.message.error(content);
  },
  info(content: string): void {
    void antdApi?.message.info(content);
  },
  warning(content: string): void {
    void antdApi?.message.warning(content);
  },
};

interface ConfirmOptions {
  title: string;
  content?: string;
  okText?: string;
  danger?: boolean;
}

/**
 * 统一的确认弹窗，返回用户是否点击了确认。
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  const api = antdApi;
  if (!api) {
    return Promise.resolve(window.confirm(options.content ?? options.title));
  }
  return new Promise((resolve) => {
    api.modal.confirm({
      title: options.title,
      content: options.content,
      okText: options.okText ?? '确认',
      cancelText: '取消',
      centered: true,
      okButtonProps: options.danger ? { danger: true } : undefined,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
