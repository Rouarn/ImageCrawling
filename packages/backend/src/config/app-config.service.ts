import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import { detectSystemProxy } from '../common/utils/system-proxy.util';
import { envFileExists, envFilePath } from './env-loader';

/**
 * 集中管理运行时配置，所有环境变量的读取都收敛在这里。
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  /** HTTP 监听端口 */
  readonly port: number;

  /** HTTP 监听地址，默认只监听本机回环地址 */
  readonly host: string;

  /** 图片存储根目录（绝对路径） */
  readonly storageRoot: string;

  /** 单次请求体上限 */
  readonly bodyLimit = '256kb';

  /** 扩展导入接口的单次请求体上限（图片原始字节） */
  readonly importBodyLimit = '25mb';

  /** 浏览器扩展导入令牌；未配置时导入接口禁用 */
  readonly importToken?: string;

  /** 服务器版本号 */
  readonly version: string = process.env.npm_package_version ?? '0.0.1';

  /** 可选：自定义 Chrome 可执行文件路径（默认使用 Puppeteer 自带版本） */
  readonly chromePath?: string;

  /** 可选：出站代理地址，供站点适配器按需使用 */
  readonly proxyUrl?: string;

  /** 代理地址来自哪个环境变量（仅用于日志，不输出地址本身） */
  readonly proxySource?: string;

  /** 运行时数据目录（人工验证 profile 等），默认仓库根目录 data/browser */
  readonly dataRoot: string;

  /** 人工验证使用的独立 Chrome profile 目录 */
  readonly verificationProfileDir: string;

  /** 单次人工验证的等待上限 */
  readonly verificationTimeoutMs: number;

  /** 验证 profile 的保留时长，超过后启动时清理 */
  readonly verificationProfileTtlMs: number;

  constructor() {
    this.port = this.readPort();
    this.host = process.env.HOST?.trim() || '127.0.0.1';
    this.importToken = process.env.IMPORT_TOKEN?.trim() || undefined;
    this.storageRoot = this.readStorageRoot();
    this.dataRoot =
      process.env.DATA_DIR?.trim() ||
      path.resolve(__dirname, '../../../../data/browser');
    this.verificationProfileDir = path.join(
      this.dataRoot,
      'chrome-verification-profile',
    );
    this.verificationTimeoutMs = readPositiveInt(
      process.env.VERIFICATION_TIMEOUT_MS,
      5 * 60_000,
    );
    this.verificationProfileTtlMs = readPositiveInt(
      process.env.VERIFICATION_PROFILE_TTL_MS,
      7 * 24 * 60 * 60_000,
    );
    this.chromePath = process.env.CHROME_PATH?.trim() || undefined;
    const proxy = readEnvWithKey(
      'CRAWL_PROXY_URL',
      'HTTPS_PROXY',
      'HTTP_PROXY',
    );
    // 没有显式配置时回退到系统代理：无头 Chrome 会走系统代理，Node 端不会
    const systemProxy = proxy ? undefined : detectSystemProxy();
    this.proxyUrl = proxy?.value ?? systemProxy;
    this.proxySource =
      proxy?.key ?? (systemProxy ? 'macOS 系统代理' : undefined);
    const girlAtlasProxy = this.getEnv('GIRL_ATLAS_PROXY');
    this.logger.log(`Storage root: ${this.storageRoot}`);
    this.logger.log(`Data root: ${this.dataRoot}`);
    this.logger.log(`Listening on: ${this.host}:${this.port}`);
    this.logger.log(
      this.importToken
        ? '扩展导入令牌：已配置'
        : '扩展导入令牌：未配置（IMPORT_TOKEN 为空，导入接口返回 503）',
    );
    this.logger.log(
      envFileExists
        ? `配置文件：已加载 ${envFilePath}（进程环境变量优先）`
        : `配置文件：未找到 ${envFilePath}（可选，可复制 .env.example 后填写）`,
    );
    if (this.chromePath) {
      this.logger.log(`Chrome path: ${this.chromePath}`);
    }
    // 只报告是否启用，绝不输出代理地址与 Cookie 内容
    this.logger.log(
      this.proxyUrl
        ? `出站代理：已启用（来自 ${this.proxySource}）`
        : '出站代理：未配置（CRAWL_PROXY_URL / HTTPS_PROXY / HTTP_PROXY 均为空）',
    );
    this.logger.log(
      girlAtlasProxy
        ? 'Girl Atlas 专用代理：已配置（来自 GIRL_ATLAS_PROXY）'
        : `Girl Atlas 专用代理：未配置（${
            this.proxyUrl ? '回退使用出站代理' : '该站点将无法访问'
          }）`,
    );
    this.logger.log(
      this.getEnv('GIRL_ATLAS_COOKIE')
        ? 'Girl Atlas Cookie：已配置'
        : 'Girl Atlas Cookie：未配置',
    );
  }

  /** 适配器读取环境变量的统一入口，敏感配置不落到源码 */
  getEnv(key: string): string | undefined {
    return process.env[key]?.trim() || undefined;
  }

  private readPort(): number {
    const raw = Number(process.env.PORT ?? 3000);
    return Number.isInteger(raw) && raw > 0 ? raw : 3000;
  }

  private readStorageRoot(): string {
    const configured = process.env.STORAGE_DIR?.trim();
    if (configured) return path.resolve(configured);
    // 默认位于仓库根目录：packages/backend/dist/config -> ../../../../data/library
    return path.resolve(__dirname, '../../../../data/library');
  }
}

/** 按顺序取第一个非空环境变量，同时返回来源变量名（用于日志，不暴露值） */
function readEnvWithKey(
  ...keys: string[]
): { value: string; key: string } | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { value, key };
  }
  return undefined;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
