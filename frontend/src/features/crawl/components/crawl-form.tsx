import { useState, type ChangeEvent } from 'react';
import {
  BranchesOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  ReloadOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, InputNumber, Segmented } from 'antd';
import type { CrawlRequest } from '@/api/contracts';
import { useCrawlOptions } from '../queries';
import { deriveOutDir } from '../lib/derive-out-dir';
import { CrawlAdvancedFields } from './crawl-advanced-fields';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { useSystemHealth } from '@/features/system/use-system-health';
import { useCrawlTaskStore } from '@/stores/crawl-task-store';

type CrawlModeOption = 'auto' | 'pattern';

interface CrawlFormValues {
  url: string;
  outDir?: string;
  maxPages?: number;
  pagePattern?: string;
  startPage?: number;
  endPage?: number;
  concurrency?: number;
  pageDelayMs?: number;
  fetchTimeoutMs?: number;
  useHeadless?: boolean;
  headers?: string;
}

function parseHeaders(raw?: string): Record<string, string> | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') headers[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') {
      headers[key] = String(value);
    }
  }
  return headers;
}

export function CrawlForm() {
  const [form] = Form.useForm<CrawlFormValues>();
  const options = useCrawlOptions();
  const { data: health } = useSystemHealth();
  const startTask = useCrawlTaskStore((state) => state.start);
  const status = useCrawlTaskStore((state) => state.status);
  const running = status === 'running';
  const [outDirTouched, setOutDirTouched] = useState(false);
  const [mode, setMode] = useState<CrawlModeOption>('auto');

  const handleUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (outDirTouched) return;
    const derived = deriveOutDir(event.target.value);
    form.setFieldValue('outDir', derived);
  };

  const handleFinish = (values: CrawlFormValues) => {
    const request: CrawlRequest = {
      url: values.url.trim(),
      outDir: values.outDir?.trim() || undefined,
      maxPages: values.maxPages,
      concurrency: values.concurrency,
      pageDelayMs: values.pageDelayMs,
      fetchTimeoutMs: values.fetchTimeoutMs,
      useHeadless: Boolean(values.useHeadless),
      headers: parseHeaders(values.headers),
    };

    if (mode === 'pattern') {
      request.pagePattern = values.pagePattern?.trim();
      request.startPage = values.startPage;
      request.endPage = values.endPage;
    }

    startTask(request);
  };

  const handleReset = () => {
    form.resetFields();
    setOutDirTouched(false);
    setMode('auto');
  };

  return (
    <Panel
      title="抓取配置"
      description="填写目标页面，选择翻页方式后开始抓取"
      actions={<Badge tone="accent">SSE 实时进度</Badge>}
      bodyClassName="p-5 sm:p-6"
    >
      <Form<CrawlFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleFinish}
        initialValues={{
          outDir: '',
          maxPages: options.defaults.maxPages,
          concurrency: options.defaults.concurrency,
          pageDelayMs: options.defaults.pageDelayMs,
          fetchTimeoutMs: options.defaults.fetchTimeoutMs,
          startPage: 1,
          useHeadless: false,
        }}
        className="space-y-4"
      >
        <Form.Item
          name="url"
          label="目标页面 URL"
          rules={[
            { required: true, message: '请输入目标页面 URL' },
            { type: 'url', message: '请输入合法的 URL（含 http/https）' },
          ]}
        >
          <Input
            size="large"
            prefix={<LinkOutlined className="text-ink-faint" />}
            placeholder="https://example.com/gallery"
            autoComplete="off"
            spellCheck={false}
            onChange={handleUrlChange}
          />
        </Form.Item>

        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item
            name="outDir"
            label="输出目录"
            extra={<span className="text-[11px]">相对 storage/ 目录，可自定义</span>}
          >
            <Input
              prefix={<FolderOpenOutlined className="text-ink-faint" />}
              placeholder="example-com"
              autoComplete="off"
              onChange={() => setOutDirTouched(true)}
            />
          </Form.Item>

          <Form.Item
            name="maxPages"
            label="最大页数"
            extra={<span className="text-[11px]">翻页抓取的上限</span>}
            rules={[
              {
                type: 'number',
                min: 1,
                max: options.limits.maxPages,
                message: `页数范围 1 - ${options.limits.maxPages}`,
              },
            ]}
          >
            <InputNumber
              min={1}
              max={options.limits.maxPages}
              className="w-full"
            />
          </Form.Item>
        </div>

        <div>
          <div className="mb-2 text-sm text-ink-soft">翻页方式</div>
          <Segmented
            block
            value={mode}
            onChange={(value) => setMode(value as CrawlModeOption)}
            options={[
              {
                label: '自动识别下一页',
                value: 'auto',
                icon: <SyncOutlined />,
              },
              {
                label: '分页模板',
                value: 'pattern',
                icon: <BranchesOutlined />,
              },
            ]}
          />
        </div>

        {mode === 'pattern' && (
          <div className="space-y-4 rounded-xl border border-line bg-surface-muted p-4">
            <Form.Item
              name="pagePattern"
              label="分页模板"
              className="!mb-0"
              rules={[
                { required: true, message: '请输入分页模板' },
                {
                  pattern: /\{page\}/,
                  message: '模板必须包含 {page} 占位符',
                },
              ]}
              extra={
                <span className="text-[11px]">
                  使用 {'{page}'} 占位符，例如 https://site.com/list?page={'{page}'}
                </span>
              }
            >
              <Input placeholder="https://site.com/list?page={page}" spellCheck={false} />
            </Form.Item>

            <div className="grid grid-cols-2 gap-4">
              <Form.Item name="startPage" label="起始页" className="!mb-0">
                <InputNumber min={1} className="w-full" />
              </Form.Item>
              <Form.Item
                name="endPage"
                label="结束页"
                className="!mb-0"
                dependencies={['startPage']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, value: number | undefined) => {
                      const start = getFieldValue('startPage') as
                        | number
                        | undefined;
                      if (value && start && value < start) {
                        return Promise.reject(
                          new Error('结束页不能小于起始页'),
                        );
                      }
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <InputNumber min={1} className="w-full" />
              </Form.Item>
            </div>
          </div>
        )}

        <CrawlAdvancedFields
          limits={options.limits}
          headlessAvailable={health?.headless.available}
        />

        <div className="flex gap-2 pt-1">
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            loading={running}
            disabled={running}
            icon={<ThunderboltOutlined />}
            className="flex-1"
          >
            {running ? '任务进行中' : '开始抓取'}
          </Button>
          <Button
            size="large"
            icon={<ReloadOutlined />}
            onClick={handleReset}
            disabled={running}
          >
            重置
          </Button>
        </div>
      </Form>
    </Panel>
  );
}
