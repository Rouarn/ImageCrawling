import type { SiteAdapter } from './types';

export const DEFAULT_ADAPTER_ID = 'default';

/**
 * 默认适配器：不做任何站点特化处理，完整保留通用抓取行为。
 * 它始终排在注册表最后，任何未命中的 URL 都会回退到这里。
 */
export const defaultAdapter: SiteAdapter = {
  id: DEFAULT_ADAPTER_ID,
  label: '通用模式',
  description: '不针对特定站点处理，使用通用抓取逻辑。',
  matches: () => true,
};
