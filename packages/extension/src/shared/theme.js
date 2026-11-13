/**
 * 统一语义色板：扩展所有界面（popup / options / 页内浮层）只从这里取色。
 * 改配色只改这一处，构建时生成 dist/theme.css，内容脚本从同一份 token 生成 shadow CSS。
 */

export const LIGHT_TOKENS = {
  // 画布与层次（参考 macOS 系统分组背景）
  'canvas': '#f2f2f7',
  'surface': '#ffffff',
  'surface-raised': '#ffffff',
  'surface-muted': '#f7f7fa',
  'surface-inset': '#ececf1',
  'surface-hover': 'rgba(0, 0, 0, 0.045)',
  // 分隔线（发丝线，代替粗边框）
  'line': 'rgba(0, 0, 0, 0.075)',
  'line-strong': 'rgba(0, 0, 0, 0.16)',
  // 文本
  'ink': '#1d1d1f',
  'ink-soft': '#4a4a4f',
  'ink-faint': '#6e6e73',
  // 强调色（足够对比度的系统蓝）
  'accent': '#0071e3',
  'accent-strong': '#0059b3',
  'accent-soft': 'rgba(0, 113, 227, 0.1)',
  'on-accent': '#ffffff',
  // 状态色
  'success': '#1d8a4e',
  'success-soft': 'rgba(29, 138, 78, 0.1)',
  'warning': '#a35200',
  'warning-soft': 'rgba(163, 82, 0, 0.1)',
  'danger': '#c4121d',
  'danger-soft': 'rgba(196, 18, 29, 0.09)',
  // 阴影：克制的悬浮感
  'shadow-panel': '0 18px 48px -24px rgba(20, 22, 30, 0.32), 0 1px 2px rgba(20, 22, 30, 0.06)',
  'shadow-control': '0 1px 2px rgba(20, 22, 30, 0.06)',
  'shadow-pill': '0 14px 30px -18px rgba(20, 22, 30, 0.5)',
  // 玻璃材质（顶部/底部栏）
  'glass': 'rgba(255, 255, 255, 0.78)',
  'glass-border': 'rgba(0, 0, 0, 0.06)',
  'scrim': 'rgba(0, 0, 0, 0.28)',
  // 控件
  'control': '#ffffff',
  'control-border': 'rgba(0, 0, 0, 0.14)',
  'segment': 'rgba(120, 120, 128, 0.12)',
  'segment-active': '#ffffff',
  'scroll-thumb': 'rgba(0, 0, 0, 0.22)',
  // 图片上的覆盖层（与主题无关，单独成 token 便于统一调整）
  'on-media': '#ffffff',
  'media-scrim': 'rgba(8, 10, 16, 0.5)',
  'media-chip': 'rgba(10, 12, 18, 0.5)',
  'media-check': 'rgba(10, 12, 18, 0.28)',
  'media-check-border': 'rgba(255, 255, 255, 0.8)',
  'media-text-shadow': '0 1px 2px rgba(0, 0, 0, 0.55)',
};

export const DARK_TOKENS = {
  'canvas': '#1c1c1e',
  'surface': '#232326',
  'surface-raised': '#2c2c2e',
  'surface-muted': '#28282b',
  'surface-inset': '#3a3a3c',
  'surface-hover': 'rgba(255, 255, 255, 0.06)',
  'line': 'rgba(255, 255, 255, 0.09)',
  'line-strong': 'rgba(255, 255, 255, 0.19)',
  'ink': '#f5f5f7',
  'ink-soft': '#c7c7cc',
  'ink-faint': '#a1a1a8',
  'accent': '#409cff',
  'accent-strong': '#6fb6ff',
  'accent-soft': 'rgba(64, 156, 255, 0.16)',
  'on-accent': '#0a1020',
  'success': '#30d158',
  'success-soft': 'rgba(48, 209, 88, 0.14)',
  'warning': '#ffb340',
  'warning-soft': 'rgba(255, 179, 64, 0.14)',
  'danger': '#ff6961',
  'danger-soft': 'rgba(255, 105, 97, 0.14)',
  'shadow-panel': '0 22px 56px -26px rgba(0, 0, 0, 0.85), 0 1px 2px rgba(0, 0, 0, 0.5)',
  'shadow-control': '0 1px 2px rgba(0, 0, 0, 0.35)',
  'shadow-pill': '0 16px 34px -18px rgba(0, 0, 0, 0.8)',
  'glass': 'rgba(28, 28, 30, 0.78)',
  'glass-border': 'rgba(255, 255, 255, 0.07)',
  'scrim': 'rgba(0, 0, 0, 0.5)',
  'control': '#2c2c2e',
  'control-border': 'rgba(255, 255, 255, 0.16)',
  'segment': 'rgba(120, 120, 128, 0.24)',
  'segment-active': '#636366',
  'scroll-thumb': 'rgba(255, 255, 255, 0.22)',
  'on-media': '#ffffff',
  'media-scrim': 'rgba(8, 10, 16, 0.5)',
  'media-chip': 'rgba(10, 12, 18, 0.5)',
  'media-check': 'rgba(10, 12, 18, 0.28)',
  'media-check-border': 'rgba(255, 255, 255, 0.8)',
  'media-text-shadow': '0 1px 2px rgba(0, 0, 0, 0.55)',
};

/** 把 token 对象序列化成 CSS 自定义属性 */
export function tokenDeclarations(tokens) {
  return Object.entries(tokens)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
}

export const THEME_KEY = 'theme';
export const THEME_MODES = ['system', 'light', 'dark'];

export function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemPrefersDark() ? 'dark' : 'light';
}

export async function getThemeMode() {
  try {
    const stored = await chrome.storage.local.get(THEME_KEY);
    return THEME_MODES.includes(stored?.[THEME_KEY]) ? stored[THEME_KEY] : 'system';
  } catch {
    return 'system';
  }
}

export async function setThemeMode(mode) {
  if (!THEME_MODES.includes(mode)) return;
  await chrome.storage.local.set({ [THEME_KEY]: mode });
}

/** 把解析后的主题写到宿主元素上，CSS 通过 [data-theme="dark"] 取值 */
export function applyTheme(element, mode) {
  const resolved = resolveTheme(mode);
  element.dataset.theme = resolved;
  element.dataset.themeMode = mode;
  element.style.colorScheme = resolved;
  return resolved;
}

/** 订阅主题变化：系统外观切换 + 其他页面写入存储都会触发。
 * 返回取消订阅函数。
 */
export function watchTheme(onChange) {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onMedia = () => onChange();
  const onStorage = (changes, area) => {
    if (area === 'local' && changes?.[THEME_KEY]) onChange();
  };
  query.addEventListener('change', onMedia);
  chrome.storage.onChanged.addListener(onStorage);
  return () => {
    query.removeEventListener('change', onMedia);
    chrome.storage.onChanged.removeListener(onStorage);
  };
}
