import {
  Injectable,
  NestMiddleware,
  ServiceUnavailableException,
} from '@nestjs/common';

import { NextFunction, Request, Response } from 'express';
import toobusy from 'toobusy-js';

import { CustomConfigService } from 'src/modules/config/config.service';

@Injectable()
export class ProtectEventLoopMiddleware implements NestMiddleware {
  isTest: boolean;
  constructor(configService: CustomConfigService) {
    this.isTest = configService.is('test');
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.isTest && toobusy()) {
      throw new ServiceUnavailableException('Server is too busy');
    } else {
      next();
    }
  }
}
