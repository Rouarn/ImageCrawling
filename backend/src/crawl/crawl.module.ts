import { Module } from '@nestjs/common';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './services/crawl.service';
import { HeadlessBrowserService } from './services/headless-browser.service';
import { ImageDownloaderService } from './services/image-downloader.service';
import { ImageExtractorService } from './services/image-extractor.service';
import { PageFetcherService } from './services/page-fetcher.service';
import { PaginationPlannerService } from './services/pagination-planner.service';

@Module({
  controllers: [CrawlController],
  providers: [
    CrawlService,
    PageFetcherService,
    PaginationPlannerService,
    ImageExtractorService,
    HeadlessBrowserService,
    ImageDownloaderService,
  ],
  exports: [HeadlessBrowserService],
})
export class CrawlModule {}
