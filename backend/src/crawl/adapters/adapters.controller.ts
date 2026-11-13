import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdapterRegistry } from './registry';
import type { AdapterSummary } from './types';

@ApiTags('adapters')
@Controller('api/adapters')
export class AdaptersController {
  constructor(private readonly registry: AdapterRegistry) {}

  @Get()
  @ApiOperation({
    summary: '列出可用的站点适配器预设',
    description:
      '前端用于渲染「站点预设」下拉。选中后按 entryUrl 填充抓取地址，' +
      'requires / notes 用于提示该站点需要的额外条件（代理、登录态等）。' +
      '未选择任何预设时行为与通用抓取完全一致。',
  })
  @ApiOkResponse({ description: '适配器预设列表' })
  list(): { adapters: AdapterSummary[] } {
    return { adapters: this.registry.list() };
  }
}
