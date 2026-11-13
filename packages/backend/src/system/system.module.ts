import { Module } from '@nestjs/common';
import { CrawlModule } from '../crawl/crawl.module';
import { SystemController } from './system.controller';

@Module({
  imports: [CrawlModule],
  controllers: [SystemController],
})
export class SystemModule {}
