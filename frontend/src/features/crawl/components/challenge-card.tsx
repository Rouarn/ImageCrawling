import { useEffect, useState } from 'react';
import { Button } from 'antd';
import {
  SafetyCertificateOutlined,
  StopOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useCrawlTaskStore } from '@/stores/crawl-task-store';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 等待人工验证的提示卡：说明任务已挂起、展示已等待时长，并提供打开窗口与取消。
 */
export function ChallengeCard() {
  const challenge = useCrawlTaskStore((state) => state.challenge);
  const opened = useCrawlTaskStore((state) => state.verificationOpened);
  const busy = useCrawlTaskStore((state) => state.verificationBusy);
  const openVerification = useCrawlTaskStore(
    (state) => state.openVerification,
  );
  const cancelVerification = useCrawlTaskStore(
    (state) => state.cancelVerification,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!challenge || challenge.state !== 'pending') return null;

  const elapsed = Math.max(0, now - challenge.receivedAt);
  const remaining = Math.max(0, challenge.timeoutMs - elapsed);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-warning/40 bg-warning-soft p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <SafetyCertificateOutlined />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">需要人工验证</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              目标站点返回了人机校验页面，任务已暂停等待，不会自动判失败。
              点击右侧按钮后会在这台电脑上打开一个独立的 Chrome 窗口，
              请在其中手动完成校验。
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-lg font-semibold text-warning">
            {formatClock(elapsed)}
          </div>
          <div className="text-[11px] text-ink-soft">
            剩余 {formatClock(remaining)} 自动失败
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {challenge.matched.map((item) => (
          <span
            key={item}
            className="rounded-md bg-surface/70 px-2 py-0.5 text-[11px] text-ink-soft"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-3 truncate rounded-lg bg-surface/60 px-2.5 py-1.5 text-[11px] text-ink-soft">
        验证地址：{challenge.verifyUrl}
      </div>

      {opened && (
        <p className="mt-2 text-[11px] leading-relaxed text-warning">
          验证窗口已打开，完成校验后会自动继续抓取；任务结束前请保持该窗口打开。
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="primary"
          size="small"
          icon={<ExportOutlined />}
          loading={busy}
          onClick={() => void openVerification()}
        >
          {opened ? '重新聚焦验证窗口' : '打开验证窗口'}
        </Button>
        <Button
          danger
          size="small"
          icon={<StopOutlined />}
          onClick={() => void cancelVerification()}
        >
          取消任务
        </Button>
      </div>
    </div>
  );
}
