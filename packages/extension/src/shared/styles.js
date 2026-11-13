import { DARK_TOKENS, LIGHT_TOKENS, tokenDeclarations } from './theme.js';

/**
 * 页内浮层与扩展弹窗共用的一套样式（全部放在 shadow DOM 内）。
 * 颜色只引用 theme.js 的语义 token，不在此处写死色值。
 */
export const PANEL_CSS = `
:host {
  all: initial;
  ${tokenDeclarations(LIGHT_TOKENS)}
}
:host([data-theme="dark"]) {
  ${tokenDeclarations(DARK_TOKENS)}
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    ${tokenDeclarations(DARK_TOKENS)}
  }
}
*, *::before, *::after { box-sizing: border-box; }
button, input, select { font-family: inherit; }
[hidden] { display: none !important; }

.ic-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 12px;
  line-height: 1.45;
  letter-spacing: -0.005em;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.ic-root :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}
.ic-root ::selection { background: var(--accent-soft); color: var(--ink); }
.ic-root ::-webkit-scrollbar { width: 9px; height: 9px; }
.ic-root ::-webkit-scrollbar-track { background: transparent; }
.ic-root ::-webkit-scrollbar-thumb {
  background-color: var(--scroll-thumb); border-radius: 999px;
  border: 2px solid transparent; background-clip: content-box;
}

/* ---------- 胶囊 ---------- */
.ic-pill {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
  display: flex; align-items: center; gap: 8px;
  height: 42px; padding: 0 16px 0 7px; border: 1px solid var(--glass-border); border-radius: 999px;
  cursor: pointer; color: var(--ink); background: var(--glass);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  font-size: 12px; font-weight: 500;
  box-shadow: var(--shadow-pill);
  transition: transform 0.16s ease, background 0.16s ease;
}
.ic-pill:hover { transform: translateY(-1px); background: var(--surface-raised); }
.ic-pill-mark {
  width: 28px; height: 28px; border-radius: 999px; background: var(--accent); color: var(--on-accent);
  display: grid; place-items: center;
}
.ic-pill b { font-variant-numeric: tabular-nums; }

/* ---------- 面板 ---------- */
.ic-panel {
  display: flex; flex-direction: column; overflow: hidden; min-height: 0;
  background: var(--surface);
  border: 1px solid var(--line); border-radius: 16px;
  box-shadow: var(--shadow-panel);
  color: var(--ink);
}
.ic-panel--overlay {
  position: fixed; right: 18px; bottom: 74px; z-index: 2147483646;
  width: min(620px, calc(100vw - 36px));
  height: min(660px, calc(100vh - 92px));
  animation: ic-panel-in 0.18s ease;
}
.ic-panel--popup {
  flex: 1 1 auto; width: 100%; height: 100%; min-height: 600px;
  border-radius: 0; border: 0; box-shadow: none;
}
@keyframes ic-panel-in {
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: none; }
}

/* ---------- 头部（玻璃栏） ---------- */
.ic-head {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 13px 16px 11px;
  background: var(--glass);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  border-bottom: 1px solid var(--line);
}
.ic-head-text { min-width: 0; flex: 1 1 auto; }
.ic-title { font-size: 14px; font-weight: 600; letter-spacing: -0.015em; }
.ic-sub {
  margin-top: 2px; font-size: 10.5px; color: var(--ink-faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ic-head-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.ic-link {
  appearance: none; border: 0; background: transparent; color: var(--ink-soft);
  font-size: 11px; padding: 5px 7px; border-radius: 6px; cursor: pointer;
}
.ic-link:hover { background: var(--surface-hover); color: var(--ink); }
.ic-icon {
  width: 24px; height: 24px; border-radius: 7px; border: 0;
  background: transparent; color: var(--ink-soft); font-size: 15px; line-height: 1; cursor: pointer;
}
.ic-icon:hover { background: var(--surface-hover); color: var(--ink); }
.ic-badge {
  font-size: 9px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-faint);
  border: 1px solid var(--line); border-radius: 5px; padding: 2px 5px;
}

/* ---------- 主题分段控件 ---------- */
.ic-theme {
  display: inline-flex; align-items: center; gap: 1px; padding: 2px;
  background: var(--segment); border-radius: 7px;
}
.ic-theme button {
  appearance: none; border: 0; background: transparent; color: var(--ink-soft);
  font-size: 10px; font-weight: 500; line-height: 1; padding: 4px 7px; border-radius: 5px;
  cursor: pointer; white-space: nowrap;
}
.ic-theme button[aria-pressed="true"] {
  background: var(--segment-active); color: var(--ink);
  box-shadow: var(--shadow-control);
}
[data-mode="overlay"] .ic-theme { display: none; }

/* ---------- 工具栏 ---------- */
.ic-toolbar {
  flex: 0 0 auto;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px;
  padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--surface-muted);
}
.ic-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ic-field { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--ink-faint); }
.ic-field select {
  appearance: none; border: 1px solid var(--control-border); border-radius: 6px;
  background: var(--control); color: var(--ink); font-size: 10.5px; padding: 3px 7px;
  cursor: pointer; box-shadow: var(--shadow-control);
}
.ic-field select:hover { border-color: var(--ink-faint); }
.ic-filter-count { font-size: 10.5px; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.ic-tool-links { display: flex; align-items: center; gap: 1px; }
.ic-tool-links button {
  appearance: none; border: 0; background: transparent; color: var(--ink-soft);
  font-size: 10.5px; padding: 4px 6px; border-radius: 5px; cursor: pointer;
}
.ic-tool-links button:hover { background: var(--surface-hover); color: var(--ink); }
.ic-tool-links i { width: 1px; height: 10px; background: var(--line-strong); display: block; }

/* ---------- 网格 ---------- */
.ic-grid {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 14px;
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: max-content; gap: 8px; align-content: start;
}
.ic-grid.is-empty { grid-auto-rows: 1fr; align-content: stretch; }
.ic-panel--popup .ic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 10px 12px; gap: 8px; }
.ic-thumb {
  position: relative; display: block; padding: 0; aspect-ratio: 3 / 4; overflow: hidden;
  cursor: pointer; border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface-inset); transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.ic-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ic-thumb .ic-shade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, var(--media-check), transparent 32%, transparent 60%, var(--media-scrim));
}
.ic-thumb.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.ic-thumb.is-failed { border-color: var(--danger); box-shadow: 0 0 0 2px var(--danger-soft); }
.ic-preview-fail {
  position: absolute; inset: 0; display: grid; place-items: center;
  color: var(--ink-faint); font-size: 9px; background: var(--surface-inset);
}
.ic-check {
  position: absolute; top: 6px; left: 6px; width: 19px; height: 19px; border-radius: 6px;
  display: grid; place-items: center; font-size: 11px; line-height: 1; color: var(--on-media);
  background: var(--media-check); border: 1.5px solid var(--media-check-border);
}
.ic-thumb.is-selected .ic-check { background: var(--accent); border-color: var(--accent); }
.ic-fail-tag {
  position: absolute; top: 6px; right: 6px; background: var(--danger); color: var(--on-media);
  font-size: 8px; line-height: 1; padding: 3px 5px; border-radius: 5px;
}
.ic-size-tag {
  position: absolute; left: 7px; bottom: 7px; font-size: 8px; line-height: 1.2; color: var(--on-media);
  text-shadow: var(--media-text-shadow); font-variant-numeric: tabular-nums;
}
.ic-format-tag {
  position: absolute; right: 6px; bottom: 6px; font-size: 7px; letter-spacing: 0.04em;
  color: var(--on-media); background: var(--media-chip); padding: 2px 4px; border-radius: 4px;
}
.ic-empty {
  grid-column: 1 / -1; min-height: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px; text-align: center;
  padding: 22px; color: var(--ink-soft);
}
.ic-empty-icon {
  width: 38px; height: 38px; border-radius: 11px; background: var(--surface-inset);
  display: grid; place-items: center; color: var(--ink-faint); font-size: 16px; margin-bottom: 4px;
}
.ic-empty b { font-size: 12px; font-weight: 600; color: var(--ink); }
.ic-empty p { margin: 0; font-size: 10.5px; color: var(--ink-faint); }
.ic-empty button {
  margin-top: 8px; border: 1px solid var(--control-border); background: var(--control);
  color: var(--ink-soft); font-size: 10.5px; padding: 5px 10px; border-radius: 7px;
  cursor: pointer; box-shadow: var(--shadow-control);
}
.ic-empty button:hover { color: var(--ink); }

/* ---------- 反馈 ---------- */
.ic-feedback {
  flex: 0 0 auto;
  margin: 0 14px 9px; padding: 9px 11px; border-radius: 9px;
  border: 1px solid var(--line); font-size: 10.5px; line-height: 1.5;
  background: var(--surface-muted);
}
.ic-panel--popup .ic-feedback { margin: 0 12px 8px; }
.ic-feedback strong { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: -0.01em; }
.ic-feedback p { margin: 2px 0 0; color: var(--ink-soft); }
.ic-feedback.is-success { background: var(--success-soft); border-color: transparent; }
.ic-feedback.is-success strong { color: var(--success); }
.ic-feedback.is-info { background: var(--accent-soft); border-color: transparent; }
.ic-feedback.is-info strong { color: var(--accent); }
.ic-feedback.is-warn { background: var(--warning-soft); border-color: transparent; }
.ic-feedback.is-warn strong { color: var(--warning); }
.ic-feedback.is-error { background: var(--danger-soft); border-color: transparent; }
.ic-feedback.is-error strong { color: var(--danger); }
.ic-progress { height: 5px; border-radius: 999px; background: var(--surface-inset); overflow: hidden; margin-top: 7px; }
.ic-progress i { display: block; height: 100%; border-radius: 999px; background: var(--accent); transition: width 0.3s ease; }
.ic-fail-list {
  list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px;
  max-height: 96px; overflow: auto;
}
.ic-fail-list li { display: flex; justify-content: space-between; gap: 10px; color: var(--ink-soft); }
.ic-fail-list b {
  font-weight: 500; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ic-fail-list span { flex: 0 0 auto; color: var(--danger); max-width: 60%; text-align: right; }
.ic-feedback button.ic-config {
  margin-top: 6px; border: 1px solid var(--control-border); background: var(--control);
  color: var(--ink); font-size: 10.5px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
}

/* ---------- 底部（玻璃栏） ---------- */
.ic-foot {
  flex: 0 0 auto;
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 14px 12px;
  background: var(--glass);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  border-top: 1px solid var(--line);
}
.ic-panel--popup .ic-foot { padding: 10px 12px 12px; gap: 7px; }
.ic-group-line { display: flex; align-items: center; gap: 8px; }
.ic-group-line label { flex: 0 0 auto; font-size: 10.5px; color: var(--ink-faint); }
.ic-group-line input {
  flex: 1; min-width: 0; font-size: 11.5px; color: var(--ink); background: var(--control);
  border: 1px solid var(--control-border); border-radius: 7px; padding: 6px 8px; outline: none;
  font-family: inherit; box-shadow: var(--shadow-control);
}
.ic-group-line input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.ic-group-hint {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  margin-left: 33px; font-size: 9.5px; color: var(--ink-faint);
}
.ic-chip {
  appearance: none; border: 1px solid var(--line); background: var(--surface-muted);
  color: var(--ink-soft); font-size: 9.5px; line-height: 1; padding: 4px 6px;
  border-radius: 5px; cursor: pointer;
}
.ic-chip:hover { border-color: var(--line-strong); color: var(--ink); }
.ic-group-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.ic-foot-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.ic-count { font-size: 10.5px; color: var(--ink-soft); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ic-count b { font-size: 12px; color: var(--ink); font-weight: 600; }
.ic-actions { display: flex; align-items: center; gap: 7px; }
.ic-panel--popup .ic-actions { width: 100%; }
.ic-panel--popup .ic-btn { flex: 1; }
.ic-btn {
  appearance: none; border: 1px solid transparent; border-radius: 8px;
  font-size: 11.5px; font-weight: 500; padding: 7px 12px; cursor: pointer; white-space: nowrap;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.14s ease;
}
.ic-btn:active { transform: translateY(1px); }
.ic-btn--primary { background: var(--accent); color: var(--on-accent); }
.ic-btn--primary:hover { background: var(--accent-strong); }
.ic-btn--ghost {
  background: var(--control); color: var(--ink);
  border-color: var(--control-border); box-shadow: var(--shadow-control);
}
.ic-btn--ghost:hover { border-color: var(--ink-faint); }
.ic-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

@media (max-width: 720px) {
  .ic-panel--overlay { width: calc(100vw - 20px); right: 10px; bottom: 68px; height: calc(100vh - 82px); }
  .ic-panel--overlay .ic-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 10px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .ic-root *, .ic-root *::before, .ic-root *::after {
    animation: none !important; transition: none !important;
    scroll-behavior: auto !important;
  }
}
`;
