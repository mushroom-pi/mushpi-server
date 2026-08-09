import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { NextFunction, Request, Response } from 'express';

import { ReadingsService } from 'src/modules/readings/readings.service';

// augment Express Request type so TS knows about req.picoUnit
declare module 'express-serve-static-core' {
  interface Request {
    picoUnit?: import('src/modules/pico-units/pico-unit.entity').PicoUnit;
  }
}

@Injectable()
export class PicoUnitByIdMiddleware implements NestMiddleware {
  constructor(private readonly readings: ReadingsService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const raw = (req.params as Record<string, string | undefined>)?.picoUnitId;
    const id = Number(raw);

    if (!raw || !Number.isFinite(id) || id <= 0) {
      return next(new UnprocessableEntityException('Invalid pico unit id'));
    }

    try {
      const unit = await this.readings.getPicoUnitWithLatestReadingById(id);
      req.picoUnit = unit;
      return next();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return next(new NotFoundException(`PicoUnit ${id} not found`));
      }
      return next(error);
    }
  }
}
