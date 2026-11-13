import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** 可执行文件来源：显式配置 > 常见安装位置自动探测 > Puppeteer 缓存 */
export type ChromeSource = 'config' | 'detected' | 'puppeteer';

export interface ChromeResolution {
  /** 命中的可执行文件路径 */
  executablePath?: string;
  /** 命中来源 */
  source?: ChromeSource;
  /** 实际尝试过的全部路径，命中后也保留，便于日志与排障 */
  attempted: string[];
}

export interface ResolveChromeOptions {
  /** 显式配置（CHROME_PATH），优先级最高 */
  configuredPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  /** Puppeteer 自带浏览器路径，作为最后的兜底 */
  puppeteerExecutablePath?: () => string | undefined;
  /** 可注入的存在性判断，便于测试 */
  exists?: (candidate: string) => boolean;
}

const MAC_CHROME_BUNDLES = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Chromium.app/Contents/MacOS/Chromium',
];

const WINDOWS_CHROME_DIRS = [
  'Google\\Chrome\\Application\\chrome.exe',
  'Google\\Chrome Beta\\Application\\chrome.exe',
  'Google\\Chrome SxS\\Application\\chrome.exe',
  'Chromium\\Application\\chrome.exe',
];

const LINUX_CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome-beta',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/opt/google/chrome/chrome',
  '/opt/google/chrome-beta/chrome',
  '/opt/chromium/chrome',
];

/**
 * 按平台列出常见 Chrome / Chromium 安装位置，顺序即优先级。
 */
export function collectChromeCandidates(
  options: ResolveChromeOptions = {},
): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();

  let candidates: string[];
  if (platform === 'darwin') {
    candidates = [
      ...['/Applications', path.join(homeDir, 'Applications')].flatMap((dir) =>
        MAC_CHROME_BUNDLES.map((bundle) => path.join(dir, bundle)),
      ),
    ];
  } else if (platform === 'win32') {
    const join = (root: string, relative: string) =>
      path.win32.join(root, relative);
    const roots = [
      readEnv(env, 'ProgramFiles'),
      readEnv(env, 'ProgramFiles(x86)', 'ProgramFilesX86'),
      readEnv(env, 'LocalAppData'),
    ].filter((root): root is string => Boolean(root));
    candidates = roots.flatMap((root) =>
      WINDOWS_CHROME_DIRS.map((relative) => join(root, relative)),
    );
  } else {
    candidates = [...LINUX_CHROME_PATHS];
  }

  return dedupe(candidates);
}

/**
 * 解析可用的浏览器可执行文件：显式配置优先，其次常见安装位置，最后 Puppeteer 缓存。
 */
export function resolveChromeExecutable(
  options: ResolveChromeOptions = {},
): ChromeResolution {
  const exists = options.exists ?? defaultExists;
  const attempted: string[] = [];

  const tryCandidate = (
    candidate: string | undefined,
    source: ChromeSource,
  ): ChromeResolution | undefined => {
    const trimmed = candidate?.trim();
    if (!trimmed || attempted.includes(trimmed)) return undefined;
    attempted.push(trimmed);
    return exists(trimmed)
      ? { executablePath: trimmed, source, attempted }
      : undefined;
  };

  const configured = tryCandidate(options.configuredPath, 'config');
  if (configured) return configured;

  for (const candidate of collectChromeCandidates(options)) {
    const detected = tryCandidate(candidate, 'detected');
    if (detected) return detected;
  }

  let puppeteerPath: string | undefined;
  try {
    puppeteerPath = options.puppeteerExecutablePath?.();
  } catch {
    puppeteerPath = undefined;
  }
  const fromPuppeteer = tryCandidate(puppeteerPath, 'puppeteer');
  if (fromPuppeteer) return fromPuppeteer;

  return { attempted };
}

/** 找不到浏览器时的自诊断说明，列出全部尝试过的路径 */
export function formatChromeHelp(resolution: ChromeResolution): string {
  const lines = ['未找到可用的 Chrome/Chromium 浏览器，已尝试以下路径：'];
  if (resolution.attempted.length === 0) {
    lines.push('  - （没有任何可尝试的路径）');
  } else {
    for (const candidate of resolution.attempted) {
      lines.push(`  - ${candidate}`);
    }
  }
  lines.push(
    '可安装 Chrome，或通过 CHROME_PATH 环境变量指定浏览器可执行文件路径后重试。',
  );
  return lines.join('\n');
}

function readEnv(
  env: NodeJS.ProcessEnv,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function defaultExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}
