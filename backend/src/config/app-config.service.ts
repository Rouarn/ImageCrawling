import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';

/**
 * 集中管理运行时配置，所有环境变量的读取都收敛在这里。
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  /** HTTP 监听端口 */
  readonly port: number;

  /** 图片存储根目录（绝对路径） */
  readonly storageRoot: string;

  /** 单次请求体上限 */
  readonly bodyLimit = '256kb';

  /** 服务器版本号 */
  readonly version: string = process.env.npm_package_version ?? '0.0.1';

  /** 可选：自定义 Chrome 可执行文件路径（默认使用 Puppeteer 自带版本） */
  readonly chromePath?: string;

  constructor() {
    this.port = this.readPort();
    this.storageRoot = this.readStorageRoot();
    this.chromePath = process.env.CHROME_PATH?.trim() || undefined;
    this.logger.log(`Storage root: ${this.storageRoot}`);
    if (this.chromePath) {
      this.logger.log(`Chrome path: ${this.chromePath}`);
    }
  }

  private readPort(): number {
    const raw = Number(process.env.PORT ?? 3000);
    return Number.isInteger(raw) && raw > 0 ? raw : 3000;
  }

  private readStorageRoot(): string {
    const configured = process.env.STORAGE_DIR?.trim();
    if (configured) return path.resolve(configured);
    // 默认位于仓库根目录：backend/dist/config -> ../../../storage
    return path.resolve(__dirname, '../../../storage');
  }
}
