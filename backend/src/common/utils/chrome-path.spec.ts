import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectChromeCandidates,
  formatChromeHelp,
  resolveChromeExecutable,
} from './chrome-path.util';

test('CHROME_PATH 优先于自动探测', () => {
  const result = resolveChromeExecutable({
    configuredPath: '/custom/chrome',
    platform: 'darwin',
    exists: (candidate) => candidate === '/custom/chrome',
  });
  assert.equal(result.executablePath, '/custom/chrome');
  assert.equal(result.source, 'config');
});

test('macOS 覆盖系统与用户目录的 Chrome / 变体', () => {
  const candidates = collectChromeCandidates({
    platform: 'darwin',
    homeDir: '/Users/demo',
  });
  assert.ok(
    candidates.includes(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ),
  );
  assert.ok(
    candidates.includes(
      '/Users/demo/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ),
  );
  assert.ok(candidates.some((path) => path.includes('Chrome Beta')));
  assert.ok(candidates.some((path) => path.includes('Chrome Canary')));
  assert.ok(candidates.some((path) => path.includes('Chromium')));
});

test('Windows 覆盖 Program Files 与 LocalAppData', () => {
  const candidates = collectChromeCandidates({
    platform: 'win32',
    env: {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LocalAppData: 'C:\\Users\\demo\\AppData\\Local',
    },
  });
  assert.ok(
    candidates.includes(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ),
  );
  assert.ok(
    candidates.includes(
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ),
  );
  assert.ok(
    candidates.includes(
      'C:\\Users\\demo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ),
  );
});

test('Linux 覆盖常见发行版路径', () => {
  const candidates = collectChromeCandidates({ platform: 'linux' });
  assert.ok(candidates.includes('/usr/bin/google-chrome'));
  assert.ok(candidates.includes('/usr/bin/chromium'));
});

test('全部探测路径失效时，提示里列出实际尝试过的路径', () => {
  const result = resolveChromeExecutable({
    platform: 'darwin',
    homeDir: '/Users/demo',
    exists: () => false,
    puppeteerExecutablePath: () => undefined,
  });

  assert.equal(result.executablePath, undefined);
  assert.ok(result.attempted.length >= 8);

  const help = formatChromeHelp(result);
  for (const candidate of result.attempted) {
    assert.ok(help.includes(candidate));
  }
  assert.ok(help.includes('CHROME_PATH'));
});
