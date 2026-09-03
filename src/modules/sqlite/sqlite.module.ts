import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomConfigModule } from 'src/modules/config/config.module';
import { CustomConfigService } from 'src/modules/config/config.service';
import { MIGRATIONS } from 'src/modules/sqlite/migrations';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [CustomConfigModule],
      inject: [CustomConfigService],
      useFactory: (config: CustomConfigService) => ({
        ...config.sqlite,
        type: 'better-sqlite3',
        autoLoadEntities: true,
        synchronize: !config.isProd, // dev/local/test — auto-sync schema
        migrationsRun: config.isProd, // prod — apply pending migrations on boot
        migrations: MIGRATIONS, // static import — ncc-bundleable (no filesystem glob)
        prepareDatabase: (db: any) => {
          db.pragma('foreign_keys = ON');
        },
      }),
    }),
  ],
})
export class SQLiteModule {}
