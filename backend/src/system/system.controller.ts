import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as fs from 'node:fs';
import { AppConfigService } from '../config/app-config.service';
import { StorageService } from '../storage/storage.service';
import { HeadlessBrowserService } from '../crawl/services/headless-browser.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  storage: { root: string; writable: boolean };
  headless: { available: boolean };
}

@ApiTags('system')
@Controller('api/system')
export class SystemController {
  constructor(
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
    private readonly headlessBrowser: HeadlessBrowserService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: '服务健康检查' })
  @ApiOkResponse({ description: '服务与存储状态' })
  health(): HealthResponse {
    const writable = this.isWritable(this.storage.root);
    return {
      status: writable ? 'ok' : 'degraded',
      version: this.config.version,
      uptimeSeconds: Math.round(process.uptime()),
      storage: { root: this.storage.root, writable },
      headless: { available: this.headlessBrowser.isAvailable() },
    };
  }

  private isWritable(directory: string): boolean {
    try {
      fs.accessSync(directory, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
