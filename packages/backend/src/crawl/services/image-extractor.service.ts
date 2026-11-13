import { Injectable } from '@nestjs/common';
import { load, type CheerioAPI } from 'cheerio';

const IMAGE_URL_PATTERN =
  /\.(jpg|jpeg|png|gif|webp|svg|avif|heic|ico|bmp|tiff)(\?.*)?$/i;

/** 懒加载图片常见的自定义属性，按优先级排列 */
const IMAGE_ATTRIBUTES = [
  'data-original',
  'data-src',
  'data-lazy',
  'data-url',
  'data-actualsrc',
  'data-href',
  'data-lazy-src',
  'data-source',
  'original-src',
  'data-pic-base64',
  'data-lazy-load-src',
  'data-actual-src',
  'data-thumb',
  'data-full',
  'file',
  'zoomfile',
  'src',
];

@Injectable()
export class ImageExtractorService {
  /**
   * 从 HTML 中提取图片地址集合。
   */
  extract(html: string, pageUrl: string): string[] {
    const $ = load(html);
    const urls = new Set<string>();

    this.collectFromImages($, pageUrl, urls);
    this.collectFromAnchors($, pageUrl, urls);
    this.collectFromPicture($, pageUrl, urls);
    this.collectFromNoscript($, pageUrl, urls);
    this.collectFromInlineStyles($, pageUrl, urls);
    this.collectFromDataAttributes($, pageUrl, urls);

    return [...urls];
  }

  /**
   * 寻找下一页地址（rel=next、.next、文本“下一页”等）。
   */
  findNextPageUrl(html: string, currentUrl: string): string | null {
    const $ = load(html);
    const candidates = [
      $("a[rel='next']").attr('href'),
      $('a.next, .pagination a.next').attr('href'),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const absolute = this.toAbsolute(candidate, currentUrl);
      if (absolute) return absolute;
    }

    let found: string | null = null;
    $('a').each((_, element) => {
      if (found) return;
      const text = ($(element).text() || '').trim().toLowerCase();
      if (!/^(next|下一页|下一頁|›|»|>)$/.test(text)) return;
      const href = $(element).attr('href');
      if (!href) return;
      found = this.toAbsolute(href, currentUrl);
    });
    return found;
  }

  private collectFromImages(
    $: CheerioAPI,
    pageUrl: string,
    urls: Set<string>,
  ): void {
    $('img').each((_, element) => {
      const $element = $(element);
      for (const attribute of IMAGE_ATTRIBUTES) {
        const value = $element.attr(attribute);
        if (!value) continue;
        const absolute = this.toAbsolute(value, pageUrl);
        if (absolute) {
          urls.add(absolute);
          break;
        }
      }
      const srcset = $element.attr('srcset') || $element.attr('data-srcset');
      const best = srcset ? this.pickFromSrcset(srcset, pageUrl) : null;
      if (best) urls.add(best);
    });
  }

  private collectFromAnchors(
    $: CheerioAPI,
    pageUrl: string,
    urls: Set<string>,
  ): void {
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (!href || !IMAGE_URL_PATTERN.test(href)) return;
      const absolute = this.toAbsolute(href, pageUrl);
      if (absolute) urls.add(absolute);
    });
  }

  private collectFromPicture(
    $: CheerioAPI,
    pageUrl: string,
    urls: Set<string>,
  ): void {
    $('picture').each((_, picture) => {
      const $picture = $(picture);
      $picture.find('source').each((__, source) => {
        const best = this.pickFromSrcset(
          $(source).attr('srcset') || '',
          pageUrl,
        );
        if (best) urls.add(best);
      });
      const src = $picture.find('img').attr('src');
      const absolute = src ? this.toAbsolute(src, pageUrl) : null;
      if (absolute) urls.add(absolute);
    });
  }

  private collectFromNoscript(
    $: CheerioAPI,
    pageUrl: string,
    urls: Set<string>,
  ): void {
    $('noscript').each((_, element) => {
      const html = $(element).html() || '';
      if (!html.trim()) return;
      try {
        const $inner = load(html);
        $inner('img').each((__, img) => {
          const src = $inner(img).attr('src');
          const absolute = src ? this.toAbsolute(src, pageUrl) : null;
          if (absolute) urls.add(absolute);
          const best = this.pickFromSrcset(
            $inner(img).attr('srcset') || '',
            pageUrl,
          );
          if (best) urls.add(best);
        });
      } catch {
        // 忽略 noscript 内非法 HTML
      }
    });
  }

  private collectFromInlineStyles(
    $: CheerioAPI,
    pageUrl: string,
    urls: Set<string>,
  ): void {
    $('*[style]').each((_, element) => {
      const style = String($(element).attr('style') || '');
      const match = style.match(
        /background-image\s*:\s*url\((['"]?)([^)'"]+)\1\)/i,
      );
      if (!match?.[2]) return;
      const absolute = this.toAbsolute(match[2], pageUrl);
      if (absolute) urls.add(absolute);
    });
  }

  private collectFromDataAttributes(
    $: CheerioAPI,
    pageUrl: string,
    urls: Set<string>,
  ): void {
    $('[data-src], [data-original]').each((_, element) => {
      const value =
        $(element).attr('data-src') || $(element).attr('data-original');
      if (!value) return;
      const absolute = this.toAbsolute(value, pageUrl);
      if (absolute) urls.add(absolute);
    });
  }

  private pickFromSrcset(srcset: string, pageUrl: string): string | null {
    const parts = String(srcset)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    let bestUrl: string | null = null;
    let bestScore = -1;

    for (const part of parts) {
      const [url] = part.split(/\s+/);
      let score = 0;
      if (/\d+w/i.test(part)) {
        score = Number(part.match(/(\d+)w/i)?.[1] ?? 0);
      } else if (/\d+(\.\d+)?x/i.test(part)) {
        score = Math.round(
          Number(part.match(/(\d+(?:\.\d+)?)x/i)?.[1] ?? 0) * 100,
        );
      }
      const absolute = this.toAbsolute(url, pageUrl);
      if (absolute && score >= bestScore) {
        bestUrl = absolute;
        bestScore = score;
      }
    }
    return bestUrl;
  }

  private toAbsolute(value: string, pageUrl: string): string | null {
    try {
      return new URL(value, pageUrl).href;
    } catch {
      return null;
    }
  }
}
