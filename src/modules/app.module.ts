import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';

import * as path from 'path';
import { DataSource } from 'typeorm';

import { TooManyRequestsGuard } from 'src/common/guards/too-many-requests.guard';
import { AppSecretBearerMiddleware } from 'src/common/middleware/app-secret-bearer.middleware';
import { PicoUnitByIdMiddleware } from 'src/common/middleware/pico-unit-by-id.middleware';
import { ProtectEventLoopMiddleware } from 'src/common/middleware/protect-event-loop.middleware';

import { BatchesModule } from './batches/batches.module';
import { CustomConfigModule } from './config/config.module';
import { CustomConfigService } from './config/config.service';
import { ControlModule } from './control/control.module';
import { CronModule } from './cron/cron.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PicoUnitsModule } from './pico-units/pico-units.module';
import { PinoLoggerModule } from './pino-logger.module';
import { ReadingsModule } from './readings/readings.module';
import { RecipesModule } from './recipes/recipes.module';
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
      useFactory: () => [
        {
          serveRoot: '/images',
          rootPath: path.resolve(process.cwd(), 'data/images'),
          serveStaticOptions: {
            index: false,
            fallthrough: false,
          },
        },
      ],
    }),
    ThrottlerModule.forRootAsync({
      imports: [CustomConfigModule],
      inject: [CustomConfigService],
      useFactory: ({ security }: CustomConfigService) => [
        {
          ttl: security.maxRequestsTime,
          limit: security.maxRequests,
        },
      ],
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TooManyRequestsGuard,
    },
  ],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ProtectEventLoopMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
    consumer
      .apply(AppSecretBearerMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
    consumer.apply(PicoUnitByIdMiddleware).forRoutes({
      path: 'pico-units/:picoUnitId',
      method: RequestMethod.ALL,
    });
    consumer.apply(PicoUnitByIdMiddleware).forRoutes({
      path: 'pico-units/:picoUnitId/*path',
      method: RequestMethod.ALL,
    });
  }
}
