import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module';
import { StorageModule } from './storage/storage.module';
import { CrawlModule } from './crawl/crawl.module';
import { ImagesModule } from './images/images.module';
import { ImportModule } from './import/import.module';
import { SystemModule } from './system/system.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';
import { createValidationPipe } from './common/http/validation-pipe.factory';

@Module({
  imports: [
    AppConfigModule,
    StorageModule,
    CrawlModule,
    ImagesModule,
    ImportModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
