import { ClassSerializerInterceptor, INestApplication } from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AbstractLoader, ExpressLoader } from '@nestjs/serve-static';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';

import { ExceptionsFilter } from '../src/common/filters/exceptions.filter';
import { AppSecretBearerMiddleware } from '../src/common/middleware/app-secret-bearer.middleware';
import { ProtectEventLoopMiddleware } from '../src/common/middleware/protect-event-loop.middleware';
import { validationPipe } from '../src/common/pipes/validation.pipe';
import { applyApiVersioning } from '../src/common/utils/api-version';
import { AppModule } from '../src/modules/app.module';
import { CustomConfigService } from '../src/modules/config/config.service';
import { CronService } from '../src/modules/cron/cron.service';

/**
 * Options for createModuleFixture().
 *
 * By default the real CronService is replaced with NoopCronService so that
 * scheduled sweeps and event handlers never issue real HTTP to Pico units
 * during e2e tests. Specs that exercise cron behaviour opt in via
 * `withCron: true` (and must keep `jest.mock('axios')` in place).
 *
 * Under `Test.createTestingModule()`, `ServeStaticModule`'s `AbstractLoader`
 * provider resolves to `NoopLoader` at compile time because no HTTP adapter
 * exists until `createNestApplication()` is called. This means `onModuleInit()`
 * no-ops and static routes are never registered. Specs that exercise static
 * file serving opt in via `withServeStatic: true`, which overrides
 * `AbstractLoader` with the real `ExpressLoader`.
 */
interface CreateModuleOptions {
  withCron?: boolean;
  withServeStatic?: boolean;
}

/**
 * Drop-in CronService substitute whose public surface mirrors every method
 * on the real service but does nothing. Prevents scheduled sweeps, startup
 * bootstrap, and batch/pico-unit event handlers from firing real HTTP during
 * e2e tests that do not explicitly opt in.
 */
class NoopCronService {
  async onApplicationBootstrap(): Promise<void> {}
  async handleReadings(): Promise<void> {}
  async handleBatchSync(): Promise<void> {}
  async handleBatchStarted(): Promise<void> {}
  async handleBatchFinished(): Promise<void> {}
  async handlePicoUnitRegistered(): Promise<void> {}
  async handlePicoUnitMonitoringStopped(): Promise<void> {}
  async handlePicoUnitMonitoringStarted(): Promise<void> {}
  async cleanReadings(): Promise<void> {}
}

export async function createModuleFixture(
  opts: CreateModuleOptions = {},
): Promise<TestingModule> {
  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (!opts.withCron) {
    builder = builder
      .overrideProvider(CronService)
      .useValue(new NoopCronService());
  }

  if (opts.withServeStatic) {
    builder = builder.overrideProvider(AbstractLoader).useClass(ExpressLoader);
  }

  return await builder.compile();
}

export async function createTestApp(
  moduleFixture?: TestingModule,
): Promise<INestApplication> {
  const module = moduleFixture || (await createModuleFixture());

  const app = module.createNestApplication();
  applyApiVersioning(app);
  const httpAdapterHost = app.get(HttpAdapterHost);
  const configService = app.get(CustomConfigService);

  /** Global nest middleware — registered via app.use() to bypass route versioning */
  const protectEventLoop = new ProtectEventLoopMiddleware(configService);
  const appSecretBearer = new AppSecretBearerMiddleware(configService);
  app.use(protectEventLoop.use.bind(protectEventLoop));
  app.use(appSecretBearer.use.bind(appSecretBearer));

  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost, configService));
  app.useGlobalPipes(validationPipe);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  return app;
}

export async function closeTestApp(app?: INestApplication): Promise<void> {
  if (!app) return;

  // Defense-in-depth: @nestjs/schedule v6 clears cron jobs on app.close() and
  // @nestjs/typeorm destroys the DataSource, so the suite exits cleanly without
  // forceExit. Explicitly stopping cron jobs here guards against regressions if
  // a future dependency change re-introduces lingering timers.
  try {
    const scheduler = app.get(SchedulerRegistry);
    scheduler.getCronJobs().forEach((job) => job.stop());
  } catch {
    // scheduler may not be available in minimal test modules
  }

  await app.close();
}
