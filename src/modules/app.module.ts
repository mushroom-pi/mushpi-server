import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { DataSource } from 'typeorm';

import { TooManyRequestsGuard } from 'src/common/guards/too-many-requests.guard';
import { AppSecretBearerMiddleware } from 'src/common/middleware/app-secret-bearer.middleware';
import { ProtectEventLoopMiddleware } from 'src/common/middleware/protect-event-loop.middleware';

import { CustomConfigModule } from './config/config.module';
import { CustomConfigService } from './config/config.service';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PinoLoggerModule } from './pino-logger.module';
import { SQLiteModule } from './sqlite/sqlite.module';
import { SwaggerModule } from './swagger/swagger.module';

@Module({
  imports: [
    CustomConfigModule,
    SwaggerModule,
    PinoLoggerModule.forRoot(),
    MonitoringModule,
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
  }
}
