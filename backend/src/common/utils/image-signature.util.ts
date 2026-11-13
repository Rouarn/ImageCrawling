export interface SniffedImage {
  ext: string;
  mime: string;
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
  '.heic',
  '.tiff',
  '.ico',
]);

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

/** 判断扩展名是否属于受支持的图片类型 */
export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
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
