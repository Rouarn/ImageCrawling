import { Module } from '@nestjs/common';
import { AdapterRegistry } from './adapters/registry';
import { AdaptersController } from './adapters/adapters.controller';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './services/crawl.service';
import { HeadlessBrowserService } from './services/headless-browser.service';
import { ImageDownloaderService } from './services/image-downloader.service';
import { ImageExtractorService } from './services/image-extractor.service';
import { PageFetcherService } from './services/page-fetcher.service';
import { PaginationPlannerService } from './services/pagination-planner.service';

@Module({
  controllers: [CrawlController, AdaptersController],
  providers: [
    CrawlService,
    PageFetcherService,
    PaginationPlannerService,
    ImageExtractorService,
    HeadlessBrowserService,
    ImageDownloaderService,
    { provide: AdapterRegistry, useFactory: () => new AdapterRegistry() },
  ],
  exports: [HeadlessBrowserService],
})
export class CrawlModule {}
