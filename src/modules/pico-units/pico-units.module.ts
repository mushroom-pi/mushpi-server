import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PicoUnitIdController } from './controllers/pico-unit-id.controller';
import { PicoUnitsController } from './controllers/pico-units.controller';
import { PicoUnitByIdMiddleware } from './middleware/pico-unit-by-id.middleware';
import { PicoUnit } from './pico-unit.entity';
import { PicoUnitsService } from './pico-units.service';

@Module({
  imports: [TypeOrmModule.forFeature([PicoUnit])],
  providers: [PicoUnitsService],
  exports: [PicoUnitsService],
  controllers: [PicoUnitsController, PicoUnitIdController],
})
export class PicoUnitsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PicoUnitByIdMiddleware).forRoutes({
      path: 'pico-units/{*picoUnitId}',
      method: RequestMethod.ALL,
    });
  }
}
