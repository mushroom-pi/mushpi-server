import { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';

import { ExceptionsFilter } from '../src/common/filters/exceptions.filter';
import { validationPipe } from '../src/common/pipes/validation.pipe';
import { AppModule } from '../src/modules/app.module';
import { CustomConfigService } from '../src/modules/config/config.service';

export async function createModuleFixture(): Promise<TestingModule> {
  return await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
}

export async function createTestApp(
  moduleFixture?: TestingModule,
): Promise<INestApplication> {
  const module = moduleFixture || (await createModuleFixture());

  const app = module.createNestApplication();
  const httpAdapterHost = app.get(HttpAdapterHost);
  const configService = app.get(CustomConfigService);

  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost, configService));
  app.useGlobalPipes(validationPipe);

  return app;
}

export async function closeTestApp(app?: INestApplication): Promise<void> {
  if (!app) return;

  // Stop all scheduled cron jobs before closing to prevent open handle leaks
  // from @nestjs/schedule timers keeping the event loop alive after app.close().
  try {
    const scheduler = app.get(SchedulerRegistry);
    scheduler.getCronJobs().forEach((job) => job.stop());
  } catch {
    // scheduler may not be available in minimal test modules
  }

  await app.close();
}
