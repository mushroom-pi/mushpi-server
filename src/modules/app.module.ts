import {
  Logger,
  MiddlewareConsumer,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';

import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { TooManyRequestsGuard } from 'src/common/guards/too-many-requests.guard';
import { TimezoneInterceptor } from 'src/common/interceptors/timezone.interceptor';
import { PicoUnitByIdMiddleware } from 'src/common/middleware/pico-unit-by-id.middleware';

import { BatchesModule } from './batches/batches.module';
import { CustomConfigModule } from './config/config.module';
import { CustomConfigService } from './config/config.service';
import { ControlModule } from './control/control.module';
import { CronModule } from './cron/cron.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PicoUnitsModule } from './pico-units/pico-units.module';
import { PinoLoggerModule } from './pino-logger.module';
import { ReadingsModule } from './readings/readings.module';
import { RecipesModule } from './recipes/recipes.module';
import { SettingsModule } from './settings/settings.module';
import { SQLiteModule } from './sqlite/sqlite.module';
import { SwaggerModule } from './swagger/swagger.module';

@Module({
  imports: [
    CustomConfigModule,
    SwaggerModule,
    PinoLoggerModule.forRoot(),
    MonitoringModule,
    ServeStaticModule.forRootAsync({
      imports: [CustomConfigModule],
      inject: [CustomConfigService],
      useFactory: (config: CustomConfigService) => {
        const staticEntries: any[] = [
          {
            serveRoot: '/images',
            rootPath: path.resolve(config.upload.imageDir),
            serveStaticOptions: {
              index: false,
              fallthrough: false,
              setHeaders: (res) => {
                const origin = config.client.clientUrl;
                if (origin) {
                  res.setHeader('Access-Control-Allow-Origin', origin);
                }
                // helmet sets Cross-Origin-Resource-Policy to same-origin by default,
                // which blocks cross-origin resource loading even with CORS headers
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
              },
            },
          },
          {
            serveRoot: '/public',
            // Repo-root build-time branding assets (Swagger UI favicon — href wired in
            // swagger.module.ts customfavIcon). Ships via Docker COPY, not a volume.
            rootPath: path.resolve('public'),
            // Bare-directory URLs ('/public', '/public/') produce a bare http-404
            // (no ENOENT) from serve-static; listing the directory paths in `exclude`
            // makes ServeStaticModule's error middleware re-raise them as Nest
            // NotFoundExceptions (404 JSON) instead of unknown errors (500). The
            // trailing-slash entry is required because the matcher tests
            // `pathname + '/'` and '/public' does not match '/public//'.
            exclude: ['/public', '/public/'],
            serveStaticOptions: {
              index: false,
              fallthrough: false, // asset-only archetype: terminal 404, never reaches the SPA catch-all
              redirect: false, // no 301 '/public' → '/public/'; the bare directory URL 404s terminally too
            },
          },
        ];

        const clientDistDir = config.client.distDir;
        if (clientDistDir) {
          const rootPath = path.resolve(clientDistDir);
          if (fs.existsSync(path.join(rootPath, 'index.html'))) {
            staticEntries.push({
              rootPath,
              renderPath: '{*any}',
              exclude: ['/v1/{*any}'],
              serveStaticOptions: {
                setHeaders: (res, assetPath: string) => {
                  if (assetPath.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-cache');
                  } else if (assetPath.includes('/assets/')) {
                    res.setHeader(
                      'Cache-Control',
                      'public, max-age=31536000, immutable',
                    );
                  }
                },
              },
            });
          } else {
            new Logger('AppModule').warn(
              `CLIENT_DIST_DIR is set to "${clientDistDir}" but no index.html was found — SPA serving disabled`,
            );
          }
        }

        return staticEntries;
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [CustomConfigModule],
      inject: [CustomConfigService],
      /**
       * Rate limiting is opt-in. Both values must be positive safe integers;
       * anything else (absent, or a value that never passed the Joi schema)
       * resolves to an EMPTY definitions array.
       *
       * That is load-bearing: with zero throttler definitions the guard's
       * per-throttler loop never runs at all, so the library writes no
       * X-RateLimit-* headers and never raises 429. Returning a definition with
       * an undefined ttl/limit instead makes the library emit literal
       * `X-RateLimit-Limit: undefined` and `NaN` remaining/reset headers on
       * every response. Headers themselves are the library's native
       * X-RateLimit-Limit / -Remaining / -Reset (reset and Retry-After are
       * relative seconds; the configured ttl is milliseconds).
       */
      useFactory: ({ security }: CustomConfigService) => {
        const limit = security.maxRequests;
        const ttl = security.maxRequestsTime;
        const configured =
          Number.isSafeInteger(limit) &&
          limit > 0 &&
          Number.isSafeInteger(ttl) &&
          ttl > 0;
        return configured ? [{ ttl, limit }] : [];
      },
    }),
    SQLiteModule,
    PicoUnitsModule,
    ReadingsModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    CronModule,
    ControlModule,
    BatchesModule,
    RecipesModule,
    DashboardModule,
    SettingsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TooManyRequestsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimezoneInterceptor,
    },
  ],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PicoUnitByIdMiddleware)
      .exclude({ path: 'v1/pico-units/announce', method: RequestMethod.ALL })
      .forRoutes(
        { path: 'v1/pico-units/:picoUnitId', method: RequestMethod.ALL },
        { path: 'v1/pico-units/:picoUnitId/*path', method: RequestMethod.ALL },
      );
  }
}
