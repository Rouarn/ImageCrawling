export interface SniffedImage {
  ext: string;
  mime: string;
}

/**
 * 受支持的图片扩展名（不含前导点）。
 *
 * 下载落盘、图片库列表识别、导入校验共用这一份：任何一侧单独维护列表，
 * 都会出现「下载成功但列表看不到」的不一致。
 */
export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif',
  'heic',
  'tiff',
  'ico',
] as const;

/** URL 里出现、但落盘时统一成另一种写法的扩展名 */
const EXTENSION_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  tif: 'tiff',
};

/**
 * 图片 URL 的扩展名匹配（允许扩展名后跟查询串）。
 *
 * 无头模式在浏览器上下文里执行，无法直接引用 Node 侧常量，
 * 因此把 pattern 源码作为参数传给 page.evaluate，保证两端同源。
 */
export const IMAGE_URL_PATTERN = new RegExp(
  `\\.(?:${IMAGE_EXTENSIONS.join('|')})(?:\\?.*)?$`,
  'i',
);

const IMAGE_EXTENSION_SET = new Set(IMAGE_EXTENSIONS.map((ext) => `.${ext}`));

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/tiff': 'tiff',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/x-icon2': 'ico',
};

/** 判断扩展名（带前导点）是否属于受支持的图片类型 */
export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSION_SET.has(ext.toLowerCase());
}

/** 把扩展名归一成落盘写法，例如 `jpeg` → `jpg`、`tif` → `tiff` */
export function normalizeImageExtension(ext: string): string {
  const normalized = ext.toLowerCase();
  return EXTENSION_ALIASES[normalized] ?? normalized;
}

export function extensionFromMime(mime: string | null | undefined): string {
  if (!mime) return '';
  return MIME_TO_EXT[mime.split(';')[0].trim().toLowerCase()] ?? '';
}

/**
 * 通过文件头（magic bytes）识别图片类型，避免把 HTML/JS 误存成图片。
 */
export function sniffImageType(buffer: Buffer): SniffedImage | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buffer.length >= 6 &&
    buffer.subarray(0, 4).toString('ascii') === 'GIF8'
  ) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'BM') {
    return { ext: 'bmp', mime: 'image/bmp' };
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return { ext: 'ico', mime: 'image/x-icon' };
  }
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[3] === 0x2a))
  ) {
    return { ext: 'tiff', mime: 'image/tiff' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('avi')) return { ext: 'avif', mime: 'image/avif' };
    if (brand.startsWith('hei') || brand.startsWith('mif1')) {
      return { ext: 'heic', mime: 'image/heic' };
    }
  }

  const head = buffer.subarray(0, 512).toString('utf8').trimStart();
  if (
    head.startsWith('<svg') ||
    (head.startsWith('<?xml') && head.toLowerCase().includes('<svg'))
  ) {
    return { ext: 'svg', mime: 'image/svg+xml' };
  }
  return null;
}
