import { PANEL_CSS } from '../shared/styles.js';
import { escapeAttr, escapeHtml } from '../shared/util.js';
import { getPrefs } from '../shared/settings.js';
import {
  applyTheme,
  getThemeMode,
  setThemeMode,
  watchTheme,
} from '../shared/theme.js';

const MIN_SIZE_OPTIONS = [
  { value: 0, label: '全部尺寸' },
  { value: 400, label: '≥ 400px' },
  { value: 800, label: '≥ 800px' },
  { value: 1200, label: '≥ 1200px' },
  { value: 1600, label: '≥ 1600px' },
  { value: 2000, label: '≥ 2000px' },
];

const FORMAT_OPTIONS = [
  { value: 'all', label: '全部格式' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'gif', label: 'GIF' },
  { value: 'avif', label: 'AVIF' },
  { value: 'svg', label: 'SVG' },
  { value: 'other', label: '其它' },
];

const KNOWN_FORMATS = new Set([
  'jpg',
  'png',
  'webp',
  'gif',
  'avif',
  'svg',
  'bmp',
  'tiff',
  'ico',
  'heic',
]);

const GRID_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;

/**
 * 页内浮层与扩展弹窗共用的面板。
 * 负责选择、筛选、计数、进度与结果反馈；采集和上传由外部注入。
 */
export class ImagePanel {
  constructor({ mode, actions }) {
    this.mode = mode;
    this.actions = actions;
    this.items = [];
    this.meta = {
      title: '',
      domain: '',
      groupDefault: 'images',
    };
    this.selected = new Set();
    this.failures = new Set();
    this.minSize = 0;
    this.format = 'all';
    this.group = '';
    this.groupInitialized = false;
    this.groupTouched = false;
    this.running = false;
    this.feedback = null;
    this.open = mode === 'popup';
    this.root = null;
    this.host = null;
    this.themeMode = 'system';
    this.groupMode = 'title';
    this.unwatchTheme = null;
  }

  mount(host) {
    this.host = host;
    const shadow = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PANEL_CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = PANEL_CSS;
      shadow.appendChild(style);
    }

    shadow.innerHTML = this.template();
    this.root = shadow.querySelector('.ic-root');
    this.pill = shadow.querySelector('.ic-pill');
    this.panel = shadow.querySelector('.ic-panel');
    this.titleEl = shadow.querySelector('.ic-title');
    this.subEl = shadow.querySelector('.ic-sub');
    this.grid = shadow.querySelector('.ic-grid');
    this.filterCount = shadow.querySelector('.ic-filter-count');
    this.feedbackEl = shadow.querySelector('.ic-feedback');
    this.groupInput = shadow.querySelector('[data-group]');
    this.groupPreview = shadow.querySelector('.ic-group-preview');
    this.countEl = shadow.querySelector('.ic-count');
    this.saveButton = shadow.querySelector('[data-act="save"]');
    this.downloadButton = shadow.querySelector('[data-act="download"]');
    this.minSelect = shadow.querySelector('[data-filter="min"]');
    this.formatSelect = shadow.querySelector('[data-filter="format"]');

    this.applyTheme();
    // 存储里的 theme 被其他界面改动时，要重新读一次再应用，
    // 否则本地缓存的手动选择会盖掉新值
    this.unwatchTheme = watchTheme(async () => {
      this.themeMode = await getThemeMode();
      this.applyTheme();
    });
    void getThemeMode().then((mode) => {
      this.themeMode = mode;
      this.applyTheme();
    });
    void getPrefs().then((prefs) => {
      this.minSize = prefs.minSize;
      this.format = prefs.format;
      this.groupMode = prefs.groupMode;
      this.groupTouched = false;
      this.groupInitialized = false;
      this.syncGrid();
      this.syncCount();
      this.applyGroupDefault();
    });

    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));

    this.panel.hidden = !this.open;
    this.syncGrid();
    this.syncCount();
    this.syncPill();
    return shadow;
  }

  template() {
    const minOptions = MIN_SIZE_OPTIONS.map(
      (option) =>
        `<option value="${option.value}">${option.label}</option>`,
    ).join('');
    const formatOptions = FORMAT_OPTIONS.map(
      (option) =>
        `<option value="${option.value}">${option.label}</option>`,
    ).join('');

    const closeAction =
      this.mode === 'overlay'
        ? '<button type="button" class="ic-icon" data-act="close" aria-label="收起面板">×</button>'
        : `<div class="ic-theme" role="group" aria-label="外观主题">
            <button type="button" data-act="theme" data-theme-mode="system" aria-pressed="false">自动</button>
            <button type="button" data-act="theme" data-theme-mode="light" aria-pressed="false">浅色</button>
            <button type="button" data-act="theme" data-theme-mode="dark" aria-pressed="false">深色</button>
          </div>`;

    return `
<div class="ic-root" data-mode="${this.mode}">
  <button type="button" class="ic-pill" data-act="open" hidden>
    <span class="ic-pill-mark">${GRID_ICON}</span>
    发现 <b data-pill-count>0</b> 张
  </button>
  <section class="ic-panel ic-panel--${this.mode}" hidden aria-label="图片采集面板">
    <header class="ic-head">
      <div class="ic-head-text">
        <div class="ic-title">发现 0 张图片</div>
        <div class="ic-sub"></div>
      </div>
      <div class="ic-head-actions">
        <button type="button" class="ic-link" data-act="settings">设置</button>
        ${closeAction}
      </div>
    </header>
    <div class="ic-toolbar">
      <div class="ic-filters">
        <label class="ic-field">最小长边
          <select data-filter="min" aria-label="按最小长边筛选，取宽高中较大的一边">${minOptions}</select>
        </label>
        <label class="ic-field">格式
          <select data-filter="format" aria-label="按格式筛选">${formatOptions}</select>
        </label>
        <span class="ic-filter-count"></span>
      </div>
      <div class="ic-tool-links">
        <button type="button" data-act="select-all">全选</button>
        <button type="button" data-act="invert">反选</button>
        <i></i>
        <button type="button" data-act="clear">清空</button>
      </div>
    </div>
    <div class="ic-grid" role="listbox" aria-multiselectable="true"></div>
    <div class="ic-feedback" hidden></div>
    <footer class="ic-foot">
      <div class="ic-group-line">
        <label for="ic-group">分组名</label>
        <input id="ic-group" data-group type="text" spellcheck="false" autocomplete="off"
          placeholder="默认使用页面标题" aria-label="分组名">
      </div>
      <div class="ic-group-hint">
        <span>可取自</span>
        <button type="button" class="ic-chip" data-act="group-title">页面标题</button>
        <button type="button" class="ic-chip" data-act="group-domain">域名</button>
        <span class="ic-group-preview"></span>
      </div>
      <div class="ic-foot-row">
        <div class="ic-count">已选 <b>0</b> / 共 0</div>
        <div class="ic-actions">
          <button type="button" class="ic-btn ic-btn--ghost" data-act="download">下载到磁盘</button>
          <button type="button" class="ic-btn ic-btn--primary" data-act="save">存入图片库</button>
        </div>
      </div>
    </footer>
  </section>
</div>`;
  }

  setData(items, meta) {
    this.items = Array.isArray(items) ? items : [];
    this.meta = meta ?? this.meta;
    const ids = new Set(this.items.map((item) => item.id));
    for (const id of [...this.selected]) {
      if (!ids.has(id)) this.selected.delete(id);
    }
    if (!this.groupTouched) this.applyGroupDefault();
    this.syncHeader();
    this.syncGroupPreview();
    this.syncGrid();
    this.syncCount();
    this.syncPill();
  }

  setOpen(open) {
    this.open = open;
    this.panel.hidden = !open;
    if (open) this.syncGrid();
    this.syncPill();
  }

  setRunning(action, done, total) {
    this.feedback = { kind: 'running', action, done, total };
    this.renderFeedback();
    this.syncButtons();
  }

  showNotice(title, text, options = {}) {
    this.feedback = {
      kind: options.tone ?? 'info',
      title,
      text,
      config: Boolean(options.config),
    };
    this.renderFeedback();
  }

  /* ---------------- 渲染 ---------------- */

  applyTheme() {
    if (!this.host) return;
    applyTheme(this.host, this.themeMode);
    this.syncThemeButtons();
  }

  syncThemeButtons() {
    const buttons = this.root?.querySelectorAll('[data-act="theme"]') ?? [];
    for (const button of buttons) {
      const active = button.getAttribute('data-theme-mode') === this.themeMode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  /** 按设置页的「分组名规则」套用默认分组（用户手动改过就不再覆盖） */
  applyGroupDefault() {
    if (this.groupTouched) return;
    const fallback =
      this.groupMode === 'domain'
        ? this.meta.domain
        : this.meta.groupDefault || this.meta.title;
    const next = fallback || this.meta.domain || 'images';
    if (next === this.group && this.groupInitialized) return;
    this.group = next;
    this.groupInput.value = next;
    this.groupInitialized = true;
    this.syncGroupPreview();
  }

  syncHeader() {
    const total = this.items.length;
    this.titleEl.textContent = `发现 ${total} 张图片`;
    const parts = [this.meta.domain, this.meta.title].filter(Boolean);
    this.subEl.textContent = parts.join(' · ');
    this.subEl.title = parts.join(' · ');
  }

  syncGroupPreview() {
    this.groupPreview.textContent = [this.meta.title, this.meta.domain]
      .filter(Boolean)
      .join(' · ');
  }

  syncPill() {
    const count = this.pill.querySelector('[data-pill-count]');
    count.textContent = String(this.items.length);
    this.pill.hidden = this.mode !== 'overlay' || this.items.length === 0 || this.open;
  }

  syncCount() {
    const selected = this.selected.size;
    this.countEl.innerHTML = `已选 <b>${selected}</b> / 共 ${this.items.length}`;
  }

  syncButtons() {
    this.saveButton.disabled = this.running;
    this.downloadButton.disabled = this.running;
  }

  syncToolbar() {
    this.minSelect.value = String(this.minSize);
    this.formatSelect.value = this.format;
    const shown = this.filteredItems().length;
    this.filterCount.textContent = `显示 ${shown} / 共 ${this.items.length}`;
  }

  syncGrid() {
    const top = this.grid.scrollTop;
    const list = this.filteredItems();
    this.grid.classList.toggle('is-empty', list.length === 0);
    this.grid.innerHTML =
      list.length > 0
        ? list.map((item) => this.thumbHtml(item)).join('')
        : this.emptyHtml();
    this.grid.scrollTop = top;
    this.syncToolbar();
  }

  thumbHtml(item) {
    const selected = this.selected.has(item.id);
    const failed = this.failures.has(item.id);
    const size =
      item.width > 0 && item.height > 0
        ? `${item.width}×${item.height}`
        : item.status === 'pending'
          ? '读取中…'
          : '尺寸未知';
    const format = (item.format || '未知').toUpperCase();
    const preview =
      item.status === 'error'
        ? '<span class="ic-preview-fail">无法预览</span>'
        : `<img src="${escapeAttr(item.url)}" alt="" loading="lazy">`;

    return `<button type="button" class="ic-thumb${selected ? ' is-selected' : ''}${
      failed ? ' is-failed' : ''
    }" data-act="toggle" data-id="${escapeAttr(item.id)}" role="checkbox" aria-checked="${selected}"
      title="${escapeAttr(item.name)} · ${escapeAttr(size)} · ${escapeAttr(format)}">
      ${preview}
      <span class="ic-shade"></span>
      <span class="ic-check">${selected ? '✓' : ''}</span>
      ${failed ? '<span class="ic-fail-tag">失败</span>' : ''}
      <span class="ic-size-tag">${escapeHtml(size)}</span>
      <span class="ic-format-tag">${escapeHtml(format)}</span>
    </button>`;
  }

  emptyHtml() {
    const hasItems = this.items.length > 0;
    if (!hasItems) {
      return `<div class="ic-empty">
        <span class="ic-empty-icon">⌕</span>
        <b>还没有发现图片</b>
        <p>图片加载或滚动出现后，这里会自动更新。</p>
      </div>`;
    }
    return `<div class="ic-empty">
      <span class="ic-empty-icon">⌕</span>
      <b>没有符合筛选条件的图片</b>
      <p>当前筛选：${escapeHtml(this.sizeLabel())} · ${escapeHtml(this.formatLabel())}</p>
      <button type="button" data-act="reset-filter">清除筛选</button>
    </div>`;
  }

  sizeLabel() {
    const option = MIN_SIZE_OPTIONS.find((item) => item.value === this.minSize);
    return option?.label ?? '全部尺寸';
  }

  formatLabel() {
    const option = FORMAT_OPTIONS.find((item) => item.value === this.format);
    return option?.label ?? '全部格式';
  }

  filteredItems() {
    return this.items.filter((item) => {
      const longEdge = Math.max(item.width || 0, item.height || 0);
      if (longEdge === 0) return this.minSize === 0;
      if (longEdge < this.minSize) return false;
      if (this.format === 'all') return true;
      if (this.format === 'other') return !KNOWN_FORMATS.has(item.format);
      return item.format === this.format;
    });
  }

  renderFeedback() {
    const feedback = this.feedback;
    if (!feedback) {
      this.feedbackEl.hidden = true;
      this.feedbackEl.innerHTML = '';
      return;
    }
    if (feedback.kind === 'running') {
      const percent = Math.round(
        (feedback.done / Math.max(1, feedback.total)) * 100,
      );
      const verb =
        feedback.action === 'save' ? '正在存入图片库…' : '正在下载…';
      this.feedbackEl.className = 'ic-feedback is-info';
      this.feedbackEl.hidden = false;
      this.feedbackEl.innerHTML = `<strong>${verb} ${feedback.done} / ${feedback.total}</strong>
        <p>保持面板打开即可查看进度，失败项会在结束后列出。</p>
        <div class="ic-progress"><i></i></div>`;
      const bar = this.feedbackEl.querySelector('.ic-progress i');
      if (bar) bar.style.width = `${percent}%`;
      return;
    }
    this.feedbackEl.hidden = false;
    if (feedback.kind === 'result') {
      this.feedbackEl.className = `ic-feedback ${
        feedback.result.failed > 0 ? 'is-warn' : 'is-success'
      }`;
      this.feedbackEl.innerHTML = this.resultHtml(feedback.result, feedback.group);
      return;
    }
    const tone =
      feedback.kind === 'error'
        ? 'is-error'
        : feedback.kind === 'warn'
          ? 'is-warn'
          : 'is-info';
    this.feedbackEl.className = `ic-feedback ${tone}`;
    this.feedbackEl.innerHTML = `<strong>${escapeHtml(feedback.title ?? '')}</strong>
      <p>${escapeHtml(feedback.text ?? '')}</p>
      ${
        feedback.config
          ? '<button type="button" class="ic-config" data-act="settings">打开扩展设置</button>'
          : ''
      }`;
  }

  resultHtml(result, group) {
    const { total, success, duplicate, failed, failures } = result;
    let title;
    if (result.kind === 'download') {
      title =
        failed > 0
          ? `共 ${total} 张：已开始下载 ${success}，失败 ${failed}`
          : `已开始下载 ${success} 张`;
    } else if (duplicate > 0 && success === 0 && failed === 0) {
      title = `已存在 ${duplicate} 张，未重复写入`;
    } else if (failed === 0) {
      title = `已存入 data/library/${group}（共 ${total} 张：新增 ${success}，重复 ${duplicate}）`;
    } else {
      title = `共 ${total} 张：成功 ${success}，重复 ${duplicate}，失败 ${failed}`;
    }

    const failureHtml =
      failures.length > 0
        ? `<ul class="ic-fail-list">${failures
            .slice(0, 8)
            .map(
              (failure) =>
                `<li><b>${escapeHtml(failure.name)}</b><span>${escapeHtml(
                  failure.reason,
                )}</span></li>`,
            )
            .join('')}</ul>${
            failures.length > 8
              ? `<p>另有 ${failures.length - 8} 张失败，详见控制台。</p>`
              : ''
          }`
        : result.kind === 'download'
          ? '<p>可在浏览器下载记录中查看。</p>'
          : '<p>图片库刷新后即可看到这些图片。</p>';

    return `<strong>${escapeHtml(title)}</strong>${failureHtml}`;
  }

  /* ---------------- 交互 ---------------- */

  handleClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionEl = target.closest('[data-act]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-act');

    switch (action) {
      case 'open':
        this.setOpen(true);
        return;
      case 'close':
        this.setOpen(false);
        return;
      case 'settings':
        this.actions.openSettings?.();
        return;
      case 'theme': {
        const mode = actionEl.getAttribute('data-theme-mode');
        if (!mode) return;
        this.themeMode = mode;
        this.applyTheme();
        void setThemeMode(mode);
        return;
      }
      case 'reset-filter':
        this.minSize = 0;
        this.format = 'all';
        this.syncGrid();
        this.syncToolbar();
        return;
      case 'select-all':
        for (const item of this.filteredItems()) this.selected.add(item.id);
        this.syncGrid();
        this.syncCount();
        return;
      case 'invert':
        for (const item of this.filteredItems()) {
          if (this.selected.has(item.id)) this.selected.delete(item.id);
          else this.selected.add(item.id);
        }
        this.syncGrid();
        this.syncCount();
        return;
      case 'clear':
        this.selected.clear();
        this.syncGrid();
        this.syncCount();
        return;
      case 'group-title':
        this.group = this.meta.title || this.meta.groupDefault || 'images';
        this.groupInput.value = this.group;
        this.groupTouched = true;
        return;
      case 'group-domain':
        this.group = this.meta.domain || 'images';
        this.groupInput.value = this.group;
        this.groupTouched = true;
        return;
      case 'toggle': {
        const id = actionEl.getAttribute('data-id');
        if (!id) return;
        if (this.selected.has(id)) this.selected.delete(id);
        else this.selected.add(id);
        this.syncGrid();
        this.syncCount();
        return;
      }
      case 'save':
        void this.startSave();
        return;
      case 'download':
        void this.startDownload();
        return;
      default:
        return;
    }
  }

  handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const filter = target.getAttribute('data-filter');
    if (filter === 'min') this.minSize = Number(target.value) || 0;
    else if (filter === 'format') this.format = target.value;
    else return;
    this.syncGrid();
  }

  handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.hasAttribute('data-group')) return;
    this.group = target.value;
    this.groupTouched = true;
  }

  currentGroup() {
    return (
      (this.groupInput.value || this.group || '').trim() ||
      this.meta.groupDefault ||
      'images'
    );
  }

  async startSave() {
    if (this.running) return;
    const urls = [...this.selected];
    if (urls.length === 0) {
      this.showNotice('请先勾选图片', '可以用「全选」选中当前筛选结果。');
      return;
    }
    const group = this.currentGroup();
    this.running = true;
    this.failures.clear();
    this.feedback = {
      kind: 'running',
      action: 'save',
      done: 0,
      total: urls.length,
    };
    this.syncButtons();
    this.renderFeedback();
    this.syncGrid();

    try {
      const result = await this.actions.save({
        urls,
        group,
        onProgress: (done, total) => {
          if (!this.running) return;
          this.feedback = { kind: 'running', action: 'save', done, total };
          this.renderFeedback();
        },
      });
      this.failures = new Set(result.failures.map((failure) => failure.url));
      this.feedback = { kind: 'result', result, group };
    } catch (error) {
      this.feedback = {
        kind: 'error',
        title: error?.needsConfig ? '需要先完成配置' : '保存失败',
        text: error?.message || String(error),
        config: Boolean(error?.needsConfig),
      };
    } finally {
      this.running = false;
      this.syncButtons();
      this.syncGrid();
      this.renderFeedback();
    }
  }

  async startDownload() {
    if (this.running) return;
    const files = [...this.selected].map((url) => ({
      url,
      name: this.items.find((item) => item.id === url)?.name || '',
    }));
    if (files.length === 0) {
      this.showNotice('请先勾选图片', '可以用「全选」选中当前筛选结果。');
      return;
    }
    this.running = true;
    this.failures.clear();
    this.feedback = {
      kind: 'running',
      action: 'download',
      done: 0,
      total: files.length,
    };
    this.syncButtons();
    this.renderFeedback();

    try {
      const result = await this.actions.download({
        files,
        onProgress: (done, total) => {
          if (!this.running) return;
          this.feedback = {
            kind: 'running',
            action: 'download',
            done,
            total,
          };
          this.renderFeedback();
        },
      });
      this.failures = new Set(result.failures.map((failure) => failure.url));
      this.feedback = { kind: 'result', result };
    } catch (error) {
      this.feedback = {
        kind: 'error',
        title: '下载失败',
        text: error?.message || String(error),
      };
    } finally {
      this.running = false;
      this.syncButtons();
      this.syncGrid();
      this.renderFeedback();
      this.syncCount();
    }
  }
}
