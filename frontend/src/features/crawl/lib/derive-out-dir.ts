/**
 * 根据目标 URL 推导一个一定合法的默认输出目录。
 *
 * 规则与后端黑名单校验对齐：只保留字母、数字、下划线和连字符，其余字符转连字符；
 * 同时兜住空结果、Windows 保留名与单段长度上限，保证自动填入的值能直接通过校验。
 */
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** 单段上限 255 字节，这里留出余量，避免接近上限时再追加后缀导致超长 */
const MAX_SEGMENT_BYTES = 200;
const FALLBACK_NAME = 'images';

export function deriveOutDir(rawUrl: string): string {
  const input = rawUrl.trim();
  if (!input) return '';

  const { hostname, pathname } = parseUrlParts(input);

  const trimmedPath = pathname.replace(/\/+$/, '');
  let segment = trimmedPath.split('/').filter(Boolean).pop() || '';
  segment = segment.replace(/\.[^./?#]+$/, '');

  // 只有域名时（如 https://example.com/）用去掉 www. 的主机名兜底
  if (!segment) {
    segment = hostname.replace(/^www\./i, '');
  }

  return toSegment(segment);
}

function parseUrlParts(input: string): { hostname: string; pathname: string } {
  try {
    const url = new URL(input);
    return { hostname: url.hostname, pathname: url.pathname };
  } catch {
    // 用户可能还没输完协议：退化为字符串解析，保证输入过程中也能推导
    const stripped = input.split(/[?#]/)[0];
    const withoutScheme = stripped.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
    const slash = withoutScheme.indexOf('/');
    const host = slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme;
    return {
      hostname: host.replace(/:\d+$/, ''),
      pathname: slash >= 0 ? withoutScheme.slice(slash) : '',
    };
  }
}

function toSegment(value: string): string {
  const slug = value
    .normalize('NFC')
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .toLowerCase();

  if (!slug) return FALLBACK_NAME;

  let candidate = clampBytes(slug, MAX_SEGMENT_BYTES).replace(/-+$/, '');
  if (!candidate) return FALLBACK_NAME;
  if (RESERVED_NAME.test(candidate)) candidate = `${candidate}-site`;
  return candidate;
}

/** 按 UTF-8 字节截断，避免切断 emoji 等代理对 */
function clampBytes(value: string, maxBytes: number): string {
  if (new TextEncoder().encode(value).length <= maxBytes) return value;

  const encoder = new TextEncoder();
  let result = '';
  let used = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (used + size > maxBytes) break;
    result += char;
    used += size;
  }
  return result;
}
