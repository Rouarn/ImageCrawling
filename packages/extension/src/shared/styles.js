/** 页内浮层与扩展弹窗共用的一套样式（全部放在 shadow DOM 内） */
export const PANEL_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
button, input, select { font-family: inherit; }
[hidden] { display: none !important; }

.ic-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  --canvas: #f4f4f7;
  --surface: #ffffff;
  --surface-muted: #f8f8fb;
  --surface-inset: #eceef3;
  --line: rgba(17, 20, 28, 0.08);
  --line-strong: rgba(17, 20, 28, 0.16);
  --ink: #14161c;
  --ink-soft: #5f6673;
  --ink-faint: #98a0ad;
  --accent: #5a5cf0;
  --accent-strong: #4648d8;
  --accent-soft: rgba(90, 92, 240, 0.1);
  --success: #15803d;
  --success-soft: rgba(21, 128, 61, 0.1);
  --warning: #b45309;
  --warning-soft: rgba(180, 83, 9, 0.1);
  --danger: #dc2626;
  --danger-soft: rgba(220, 38, 38, 0.08);
  --elevation-card: 0 1px 2px rgba(16, 20, 30, 0.04), 0 18px 40px -28px rgba(16, 20, 30, 0.35);
  --font-family: "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color-scheme: light;
  font-family: var(--font-family);
  color: var(--ink);
  line-height: 1.4;
  text-align: left;
  font-size: 12px;
}
.ic-root.is-dark {
  --canvas: #08090c;
  --surface: #111318;
  --surface-muted: #15181e;
  --surface-inset: #1c2029;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
  --ink: #eceef4;
  --ink-soft: #a2a9b6;
  --ink-faint: #6f7683;
  --accent: #8b8dff;
  --accent-strong: #a9abff;
  --accent-soft: rgba(139, 141, 255, 0.14);
  --success: #4ade80;
  --success-soft: rgba(74, 222, 128, 0.12);
  --warning: #fbbf24;
  --warning-soft: rgba(251, 191, 36, 0.12);
  --danger: #f87171;
  --danger-soft: rgba(248, 113, 113, 0.12);
  --elevation-card: 0 1px 2px rgba(0, 0, 0, 0.45), 0 24px 56px -32px rgba(0, 0, 0, 0.9);
  color-scheme: dark;
}
.ic-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ic-root ::selection { background: var(--accent); color: #fff; }
.ic-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.ic-root ::-webkit-scrollbar-track { background: transparent; }
.ic-root ::-webkit-scrollbar-thumb { background-color: var(--line-strong); border-radius: 999px; }

.ic-root[data-mode="popup"] { height: 100%; }

/* ---------- 胶囊 ---------- */
.ic-pill {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
  display: flex; align-items: center; gap: 9px;
  height: 46px; padding: 0 17px 0 8px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--ink); color: var(--surface);
  font-size: 12px; font-weight: 500; box-shadow: 0 18px 40px -18px rgba(16, 20, 30, 0.65);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.ic-pill:hover { transform: translateY(-1px); box-shadow: 0 22px 46px -18px rgba(16, 20, 30, 0.7); }
.ic-pill-mark {
  width: 30px; height: 30px; border-radius: 999px; background: var(--accent); color: #fff;
  display: grid; place-items: center;
}
.ic-pill b { font-variant-numeric: tabular-nums; }

/* ---------- 面板 ---------- */
.ic-panel {
  display: flex; flex-direction: column; overflow: hidden; min-height: 0;
  background: var(--surface); border: 1px solid var(--line); border-radius: 18px;
  box-shadow: 0 30px 70px -32px rgba(16, 20, 30, 0.55), 0 2px 10px rgba(16, 20, 30, 0.08);
  color: var(--ink);
}
.ic-panel--overlay {
  position: fixed; right: 18px; bottom: 78px; z-index: 2147483646;
  width: min(620px, calc(100vw - 36px));
  height: min(660px, calc(100vh - 96px));
  animation: ic-panel-in 0.18s ease;
}
.ic-panel--popup {
  flex: 1 1 auto; width: 100%; height: 100%; min-height: 600px;
  border-radius: 0; border: 0; box-shadow: none;
}
@keyframes ic-panel-in {
  from { opacity: 0; transform: translateY(9px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
.ic-head {
  flex: 0 0 auto;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 15px 18px 12px; border-bottom: 1px solid var(--line);
}
.ic-head-text { min-width: 0; }
.ic-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.ic-sub {
  margin-top: 3px; font-size: 10px; color: var(--ink-faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ic-head-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.ic-link {
  appearance: none; border: 0; background: transparent; color: var(--ink-soft);
  font-size: 10px; padding: 4px 6px; border-radius: 6px; cursor: pointer;
}
.ic-link:hover { background: var(--surface-inset); color: var(--ink); }
.ic-icon {
  width: 26px; height: 26px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--ink-soft); font-size: 16px; line-height: 1; cursor: pointer;
}
.ic-icon:hover { background: var(--surface-inset); color: var(--ink); }
.ic-badge {
  font-size: 9px; letter-spacing: 0.06em; color: var(--ink-faint);
  border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; margin-top: 2px;
}

/* ---------- 工具栏 ---------- */
.ic-toolbar {
  flex: 0 0 auto;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 16px; border-bottom: 1px solid var(--line); background: var(--surface-muted);
}
.ic-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ic-field { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--ink-faint); }
.ic-field select {
  appearance: none; border: 1px solid var(--line-strong); border-radius: 7px;
  background: var(--surface); color: var(--ink); font-size: 10px; padding: 4px 7px; cursor: pointer;
}
.ic-field select:hover { border-color: var(--ink-faint); }
.ic-filter-count { font-size: 10px; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.ic-tool-links { display: flex; align-items: center; gap: 2px; }
.ic-tool-links button {
  appearance: none; border: 0; background: transparent; color: var(--ink-soft);
  font-size: 10px; padding: 4px 7px; border-radius: 6px; cursor: pointer;
}
.ic-tool-links button:hover { background: var(--surface-inset); color: var(--ink); }
.ic-tool-links i { width: 1px; height: 10px; background: var(--line); display: block; }

/* ---------- 网格 ---------- */
.ic-grid {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px;
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: max-content; gap: 9px; align-content: start;
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
  background: linear-gradient(180deg, rgba(8, 10, 16, 0.2), transparent 34%, transparent 58%, rgba(8, 10, 16, 0.52));
}
.ic-thumb.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.ic-thumb.is-failed { border-color: var(--danger); box-shadow: 0 0 0 2px var(--danger-soft); }
.ic-preview-fail {
  position: absolute; inset: 0; display: grid; place-items: center;
  color: var(--ink-faint); font-size: 9px; background: var(--surface-inset);
}
.ic-check {
  position: absolute; top: 6px; left: 6px; width: 20px; height: 20px; border-radius: 6px;
  display: grid; place-items: center; font-size: 11px; line-height: 1; color: #fff;
  background: rgba(10, 12, 18, 0.3); border: 1.5px solid rgba(255, 255, 255, 0.78);
}
.ic-thumb.is-selected .ic-check { background: var(--accent); border-color: var(--accent); }
.ic-fail-tag {
  position: absolute; top: 6px; right: 6px; background: var(--danger); color: #fff;
  font-size: 8px; line-height: 1; padding: 3px 5px; border-radius: 5px;
}
.ic-size-tag {
  position: absolute; left: 7px; bottom: 7px; font-size: 8px; line-height: 1.2; color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55); font-variant-numeric: tabular-nums;
}
.ic-format-tag {
  position: absolute; right: 6px; bottom: 6px; font-size: 7px; letter-spacing: 0.04em;
  color: #fff; background: rgba(10, 12, 18, 0.5); padding: 2px 4px; border-radius: 4px;
}
.ic-empty {
  grid-column: 1 / -1; min-height: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 5px; text-align: center;
  padding: 22px; color: var(--ink-soft);
}
.ic-empty-icon {
  width: 40px; height: 40px; border-radius: 12px; background: var(--surface-inset);
  display: grid; place-items: center; color: var(--ink-faint); font-size: 17px; margin-bottom: 3px;
}
.ic-empty b { font-size: 12px; font-weight: 600; color: var(--ink); }
.ic-empty p { margin: 0; font-size: 10px; color: var(--ink-faint); }
.ic-empty button {
  margin-top: 7px; border: 1px solid var(--line-strong); background: var(--surface);
  color: var(--ink-soft); font-size: 10px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
}

/* ---------- 反馈 ---------- */
.ic-feedback {
  flex: 0 0 auto;
  margin: 0 16px 10px; padding: 10px 12px; border-radius: 11px;
  border: 1px solid var(--line); font-size: 10px; line-height: 1.55;
}
.ic-panel--popup .ic-feedback { margin: 0 12px 8px; }
.ic-feedback strong { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: -0.005em; }
.ic-feedback p { margin: 2px 0 0; color: var(--ink-soft); }
.ic-feedback.is-success { background: var(--success-soft); }
.ic-feedback.is-success strong { color: var(--success); }
.ic-feedback.is-info { background: var(--accent-soft); }
.ic-feedback.is-info strong { color: var(--accent); }
.ic-feedback.is-warn { background: var(--warning-soft); }
.ic-feedback.is-warn strong { color: var(--warning); }
.ic-feedback.is-error { background: var(--danger-soft); }
.ic-feedback.is-error strong { color: var(--danger); }
.ic-progress { height: 6px; border-radius: 999px; background: var(--surface-inset); overflow: hidden; margin-top: 7px; }
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
  margin-top: 6px; border: 1px solid var(--line-strong); background: var(--surface);
  color: var(--ink); font-size: 10px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
}

/* ---------- 底部 ---------- */
.ic-foot {
  flex: 0 0 auto;
  display: flex; flex-direction: column; gap: 9px;
  padding: 11px 16px 13px; border-top: 1px solid var(--line); background: var(--surface);
}
.ic-panel--popup .ic-foot { padding: 10px 12px 12px; gap: 8px; }
.ic-group-line { display: flex; align-items: center; gap: 8px; }
.ic-group-line label { flex: 0 0 auto; font-size: 10px; color: var(--ink-faint); }
.ic-group-line input {
  flex: 1; min-width: 0; font-size: 11px; color: var(--ink); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: 8px; padding: 7px 9px; outline: none;
  font-family: inherit;
}
.ic-group-line input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.ic-group-hint {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  margin-left: 34px; font-size: 9px; color: var(--ink-faint);
}
.ic-chip {
  appearance: none; border: 1px solid var(--line); background: var(--surface-muted);
  color: var(--ink-soft); font-size: 9px; line-height: 1; padding: 4px 6px;
  border-radius: 5px; cursor: pointer;
}
.ic-chip:hover { border-color: var(--line-strong); color: var(--ink); }
.ic-group-preview {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
.ic-foot-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ic-count { font-size: 10px; color: var(--ink-soft); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ic-count b { font-size: 12px; color: var(--ink); font-weight: 600; }
.ic-actions { display: flex; align-items: center; gap: 7px; }
.ic-panel--popup .ic-actions { width: 100%; }
.ic-panel--popup .ic-btn { flex: 1; }
.ic-btn {
  appearance: none; border: 1px solid transparent; border-radius: 9px;
  font-size: 11px; font-weight: 500; padding: 8px 12px; cursor: pointer; white-space: nowrap;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.14s ease;
}
.ic-btn:active { transform: translateY(1px); }
.ic-btn--primary { background: var(--accent); color: #fff; }
.ic-btn--primary:hover { background: var(--accent-strong); }
.ic-btn--ghost { background: var(--surface); color: var(--ink); border-color: var(--line-strong); }
.ic-btn--ghost:hover { border-color: var(--ink-faint); }
.ic-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

@media (max-width: 720px) {
  .ic-panel--overlay { width: calc(100vw - 20px); right: 10px; bottom: 72px; height: calc(100vh - 86px); }
  .ic-panel--overlay .ic-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 10px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .ic-root *, .ic-root *::before, .ic-root *::after {
    animation: none !important; transition: none !important;
  }
}
`;
