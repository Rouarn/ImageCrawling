import { useState } from 'react';
import {
  DownOutlined,
  InfoCircleOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Form, Input, InputNumber, Switch } from 'antd';
import type { CrawlLimits } from '@/api/contracts';
import { cn } from '@/lib/cn';

interface CrawlAdvancedFieldsProps {
  limits: CrawlLimits;
  headlessAvailable: boolean | undefined;
}

export function CrawlAdvancedFields({
  limits,
  headlessAvailable,
}: CrawlAdvancedFieldsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <InfoCircleOutlined />
          高级选项
          <span className="font-normal text-ink-faint">
            并发、延迟、超时、请求头
          </span>
        </span>
        <span className="text-ink-faint">
          {open ? <UpOutlined /> : <DownOutlined />}
        </span>
      </button>

      <div
        className={cn(
          'border-t border-line px-3.5 py-4',
          open ? 'grid gap-4 sm:grid-cols-3' : 'hidden',
        )}
      >
        <Form.Item
          label="并发下载数"
          name="concurrency"
          extra={<span className="text-[11px]">同时下载的图片数量</span>}
        >
          <InputNumber
            min={1}
            max={limits.concurrency}
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          label="页间延迟"
          name="pageDelayMs"
          extra={<span className="text-[11px]">毫秒，降低请求频率</span>}
        >
          <InputNumber
            min={0}
            max={limits.pageDelayMs}
            step={100}
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          label="请求超时"
          name="fetchTimeoutMs"
          extra={<span className="text-[11px]">毫秒，单次请求上限</span>}
        >
          <InputNumber
            min={1000}
            max={limits.fetchTimeoutMs}
            step={1000}
            className="w-full"
          />
        </Form.Item>

        <div className="sm:col-span-3">
          <Form.Item
            label="无头浏览器"
            name="useHeadless"
            valuePropName="checked"
            extra={
              <span className="text-[11px]">
                使用 Puppeteer 渲染动态页面，速度较慢但可处理 JS 加载的图片
                {headlessAvailable === false && (
                  <span className="ml-1 text-warning">
                    · 本机未检测到 Chrome for Testing，需先执行
                    `puppeteer browsers install chrome`
                  </span>
                )}
              </span>
            }
          >
            <Switch />
          </Form.Item>
        </div>

        <div className="sm:col-span-3">
          <Form.Item
            label="自定义请求头（JSON）"
            name="headers"
            extra={
              <span className="text-[11px]">
                例如 {'{"user-agent":"Mozilla/5.0","cookie":"a=b"}'}
              </span>
            }
            rules={[
              {
                validator: (_, value: string) => {
                  if (!value?.trim()) return Promise.resolve();
                  try {
                    const parsed: unknown = JSON.parse(value);
                    if (
                      !parsed ||
                      typeof parsed !== 'object' ||
                      Array.isArray(parsed)
                    ) {
                      return Promise.reject(
                        new Error('请求头必须是 JSON 对象'),
                      );
                    }
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(
                      new Error('请输入合法的 JSON 格式'),
                    );
                  }
                },
              },
            ]}
          >
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={'{"referer": "https://example.com"}'}
              spellCheck={false}
            />
          </Form.Item>
        </div>
      </div>
    </div>
  );
}
