import { execFileSync } from 'node:child_process';

/**
 * 解析 `scutil --proxy` 的输出。
 * 优先级：HTTPS → HTTP → SOCKS；未启用的协议跳过。
 */
export function parseMacSystemProxy(output: string): string | undefined {
  const values = new Map<string, string>();
  for (const line of output.split('\n')) {
    const match = /^\s*([A-Za-z]+)\s*:\s*(\S+)\s*$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }

  const pick = (prefix: 'HTTPS' | 'HTTP' | 'SOCKS'): string | undefined => {
    if (values.get(`${prefix}Enable`) !== '1') return undefined;
    const host = values.get(`${prefix}Proxy`);
    const port = values.get(`${prefix}Port`);
    if (!host || !port) return undefined;
    return `${prefix === 'SOCKS' ? 'socks5' : 'http'}://${host}:${port}`;
  };

  return pick('HTTPS') ?? pick('HTTP') ?? pick('SOCKS');
}

let detected = false;
let cached: string | undefined;

/**
 * 未显式配置代理时，回退到 macOS 系统代理。
 *
 * 无头浏览器会自动使用系统代理，而 Node 的 fetch/undici 不会；
 * 不做这个回退会出现「页面能打开、图片全部下载失败」的割裂。
 */
export function detectSystemProxy(): string | undefined {
  if (detected) return cached;
  detected = true;
  if (process.platform !== 'darwin') return undefined;

  try {
    const output = execFileSync('scutil', ['--proxy'], {
      encoding: 'utf8',
      timeout: 2000,
    });
    cached = parseMacSystemProxy(output);
  } catch {
    cached = undefined;
  }
  return cached;
}
