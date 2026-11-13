import { fileNameFromUrl, formatFromUrl } from '../shared/util.js';

/** 常见的懒加载属性（含 data-srcset 这类集合写法） */
const LAZY_URL_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-lazy',
  'data-url',
  'data-echo',
  'data-image',
  'data-image-src',
  'data-actualsrc',
  'data-defer-src',
  'data-hi-res-src',
  'data-full-src',
  'data-large',
  'data-large_image',
  'data-lazyload',
  'data-original-src',
  'data-thumb',
];
const LAZY_SRCSET_ATTRS = [
  'data-srcset',
  'data-lazy-srcset',
  'data-original-srcset',
];
const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'HEAD',
  'TITLE',
  'TEMPLATE',
  'NOSCRIPT',
  'BR',
]);
const HOST_ID = 'image-crawler-host';
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_CONCURRENCY = 6;
const MUTATION_DEBOUNCE_MS = 400;
const MAX_BACKGROUND_ELEMENTS = 15_000;

/**
 * 页面图片采集器。
 *
 * 覆盖：<img>（src / currentSrc / srcset）、常见懒加载 data-* 属性、
 * <picture> 内的 source[srcset]、CSS background-image（内联与样式表）。
 * 只读取当前 DOM，不滚动页面、不触发懒加载。
 */
export class ImageCollector {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.items = new Map();
    this.queue = [];
    this.active = 0;
    this.emitTimer = null;
    this.scanTimer = null;
    this.observer = null;
    this.backgroundScanCount = 0;
    this.onImageLoad = (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement) this.addImg(target);
    };
    this.onResize = () => this.scheduleFullScan();
  }

  start() {
    this.fullScan();
    document.addEventListener('load', this.onImageLoad, true);
    window.addEventListener('resize', this.onResize, { passive: true });
    this.observer = new MutationObserver((records) => this.handleMutations(records));
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'src',
        'srcset',
        'style',
        'class',
        ...LAZY_URL_ATTRS,
        ...LAZY_SRCSET_ATTRS,
      ],
    });
  }

  stop() {
    this.observer?.disconnect();
    document.removeEventListener('load', this.onImageLoad, true);
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.emitTimer);
    clearTimeout(this.scanTimer);
  }

  getItems() {
    return [...this.items.values()];
  }

  get(url) {
    return this.items.get(url);
  }

  /** 全量重扫：只在初始化、窗口尺寸变化和手动刷新时触发 */
  fullScan() {
    this.backgroundScanCount = 0;
    for (const element of document.querySelectorAll('*')) {
      if (element.id === HOST_ID) continue;
      if (element.tagName === 'IMG') this.addImg(element);
      else if (element.tagName === 'SOURCE') this.addSource(element);
      this.addBackground(element);
    }
  }

  scheduleFullScan() {
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.fullScan(), MUTATION_DEBOUNCE_MS);
  }

  handleMutations(records) {
    const elements = new Set();
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) elements.add(node);
        }
      } else if (record.type === 'attributes' && record.target.nodeType === Node.ELEMENT_NODE) {
        elements.add(record.target);
      }
    }
    if (elements.size === 0) return;
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      this.backgroundScanCount = 0;
      for (const element of elements) this.scanSubtree(element);
    }, MUTATION_DEBOUNCE_MS);
  }

  scanSubtree(root) {
    if (!(root instanceof Element)) return;
    if (root.id === HOST_ID || root.closest(`#${HOST_ID}`)) return;

    this.scanElement(root);
    for (const element of root.querySelectorAll('*')) {
      if (element.id === HOST_ID) continue;
      this.scanElement(element);
    }
  }

  scanElement(element) {
    if (IGNORED_TAGS.has(element.tagName)) return;
    if (element.tagName === 'IMG') this.addImg(element);
    else if (element.tagName === 'SOURCE') this.addSource(element);
    this.addBackground(element);
  }

  addImg(img) {
    const lazyUrls = [];
    for (const attr of LAZY_URL_ATTRS) {
      const value = img.getAttribute(attr);
      const url = value ? this.normalizeUrl(value) : '';
      if (url) lazyUrls.push(url);
    }
    for (const attr of LAZY_SRCSET_ATTRS) {
      const value = img.getAttribute(attr);
      if (value) lazyUrls.push(...this.parseSrcset(value));
    }

    if (lazyUrls.length > 0) {
      // 懒加载页面里 src 常是占位图，优先使用真实地址
      lazyUrls.forEach((url) => this.add(url));
      return;
    }

    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const candidates = this.parseSrcsetWithScore(srcset);
      if (candidates.length > 0) this.add(candidates[candidates.length - 1].url);
      return;
    }

    const current = img.currentSrc || img.src;
    const url = current ? this.normalizeUrl(current) : '';
    if (url) this.add(url);
  }

  addSource(source) {
    const parentPicture = source.parentElement;
    const pictureImg = parentPicture?.querySelector('img');
    // <picture> 里通常有 img，交给 addImg 处理即可，避免同一张图出现两次
    if (pictureImg && (pictureImg.currentSrc || pictureImg.getAttribute('srcset'))) {
      return;
    }
    for (const attr of [...LAZY_SRCSET_ATTRS, 'srcset']) {
      const value = source.getAttribute(attr);
      if (!value) continue;
      const candidates = this.parseSrcsetWithScore(value);
      if (candidates.length > 0) this.add(candidates[candidates.length - 1].url);
      return;
    }
  }

  addBackground(element) {
    if (IGNORED_TAGS.has(element.tagName)) return;
    let value = element.style?.backgroundImage || '';
    if (!value || value === 'none') {
      if (this.backgroundScanCount > MAX_BACKGROUND_ELEMENTS) return;
      this.backgroundScanCount += 1;
      try {
        value = getComputedStyle(element).backgroundImage;
      } catch {
        return;
      }
    }
    if (!value || value === 'none') return;
    const pattern = /url\((['"]?)([^'")]+)\1\)/g;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      const url = this.normalizeUrl(match[2]);
      if (url) this.add(url);
    }
  }

  /** 只接受 http(s) 地址；data: / blob: 不支持上传 */
  normalizeUrl(raw) {
    try {
      const url = new URL(raw.trim(), document.baseURI);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch {
      return '';
    }
  }

  parseSrcset(value) {
    return this.parseSrcsetWithScore(value).map((candidate) => candidate.url);
  }

  /**
   * 解析 srcset，并按候选尺寸/倍率从大到小排序。
   * 只取最大的一张，避免同一张图因多档尺寸被重复收集。
   */
  parseSrcsetWithScore(value) {
    const candidates = [];
    for (const part of value.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [rawUrl, ...descriptors] = trimmed.split(/\s+/);
      const url = this.normalizeUrl(rawUrl);
      if (!url) continue;
      let score = 0;
      for (const descriptor of descriptors) {
        const width = /^(\d+)w$/i.exec(descriptor);
        if (width) score = Math.max(score, Number(width[1]));
        const density = /^([\d.]+)x$/i.exec(descriptor);
        if (density) score = Math.max(score, Number(density[1]) * 1000);
      }
      candidates.push({ url, score });
    }
    return candidates.sort((a, b) => a.score - b.score);
  }

  add(url) {
    if (!url || this.items.has(url)) return;
    const item = {
      id: url,
      url,
      name: fileNameFromUrl(url),
      format: formatFromUrl(url),
      width: 0,
      height: 0,
      status: 'pending',
    };
    this.items.set(url, item);
    this.queue.push(item);
    this.pump();
    this.emit();
  }

  pump() {
    while (this.active < PROBE_CONCURRENCY && this.queue.length > 0) {
      const item = this.queue.shift();
      this.active += 1;
      this.probe(item)
        .then((size) => {
          item.width = size.width;
          item.height = size.height;
          item.status = 'ready';
          if (!item.format && size.format) item.format = size.format;
        })
        .catch(() => {
          item.status = 'error';
        })
        .finally(() => {
          this.active -= 1;
          this.emit();
          this.pump();
        });
    }
  }

  probe(item) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        callback(value);
      };
      const timer = setTimeout(() => finish(reject, new Error('timeout')), PROBE_TIMEOUT_MS);
      image.onload = () =>
        finish(resolve, {
          width: image.naturalWidth,
          height: image.naturalHeight,
          format: formatFromUrl(item.url),
        });
      image.onerror = () => finish(reject, new Error('load-error'));
      image.decoding = 'async';
      image.src = item.url;
    });
  }

  emit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.onChange?.(this.getItems());
    }, 200);
  }
}
