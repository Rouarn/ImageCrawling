import { DEFAULT_ADAPTER_ID, defaultAdapter } from './default.adapter';
import { girlAtlasAdapter } from './girl-atlas.adapter';
import type { AdapterSummary, SiteAdapter } from './types';

/**
 * 注册顺序即优先级：越靠前越优先命中，默认适配器必须放在最后。
 * 新增站点时在这里追加一行即可。
 */
export const REGISTERED_ADAPTERS: readonly SiteAdapter[] = [
  girlAtlasAdapter,
  defaultAdapter,
];

export class AdapterRegistry {
  private readonly adapters: readonly SiteAdapter[];

  constructor(adapters: readonly SiteAdapter[] = REGISTERED_ADAPTERS) {
    this.adapters = adapters.length > 0 ? adapters : [defaultAdapter];
  }

  /**
   * 全链路唯一的适配器解析入口。
   * 按注册顺序返回第一个匹配的适配器，未命中时回退到默认适配器。
   */
  resolveAdapter(url: string): SiteAdapter {
    let parsed: URL | undefined;
    try {
      parsed = new URL(url);
    } catch {
      parsed = undefined;
    }

    if (parsed) {
      for (const adapter of this.adapters) {
        if (adapter.matches(parsed)) return adapter;
      }
    }
    return this.fallbackAdapter();
  }

  /** 返回带预设的站点适配器；默认适配器不对外暴露为预设 */
  list(): AdapterSummary[] {
    return this.adapters
      .filter((adapter) => adapter.id !== DEFAULT_ADAPTER_ID && adapter.preset)
      .map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        description: adapter.description,
        entryUrl: adapter.preset?.entryUrl,
        requires: adapter.preset?.requires ?? [],
        notes: adapter.preset?.notes ?? [],
        options: adapter.preset?.options,
      }));
  }

  private fallbackAdapter(): SiteAdapter {
    return (
      this.adapters.find((adapter) => adapter.id === DEFAULT_ADAPTER_ID) ??
      defaultAdapter
    );
  }
}
