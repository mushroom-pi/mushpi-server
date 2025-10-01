import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validationSchema } from './config.schema';
import { CustomConfigService } from './config.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test.local' : '.env',
      validationSchema,
      isGlobal: true,
      cache: true,
    }),
  ],
  providers: [CustomConfigService],
  exports: [CustomConfigService],
})
export class CustomConfigModule {}
