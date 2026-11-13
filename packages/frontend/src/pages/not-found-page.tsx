import { Link } from 'react-router-dom';
import { CompassOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export default function NotFoundPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="404"
        title="页面不存在"
        description="你访问的地址不在当前工作台内。"
      />
      <div className="surface-card">
        <EmptyState
          icon={<CompassOutlined />}
          title="走丢了"
          description="可能是链接过期或地址输入有误，回到抓取任务继续使用吧。"
          action={
            <Link to="/">
              <Button type="primary">返回抓取任务</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}
