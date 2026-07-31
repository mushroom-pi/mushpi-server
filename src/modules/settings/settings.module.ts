import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Settings } from './settings.entity';
import { SettingsService } from './settings.service';
import { SettingsV1Controller } from './settings.v1.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Settings])],
  controllers: [SettingsV1Controller],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
