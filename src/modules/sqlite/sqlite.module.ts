import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomConfigModule } from 'src/modules/config/config.module';
import { CustomConfigService } from 'src/modules/config/config.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [CustomConfigModule],
      inject: [CustomConfigService],
      useFactory: (config: CustomConfigService) => ({
        ...config.sqlite,
        type: 'better-sqlite3',
        autoLoadEntities: true,
        synchronize: !config.isProd,
      }),
    }),
  ],
})
export class SQLiteModule {}
