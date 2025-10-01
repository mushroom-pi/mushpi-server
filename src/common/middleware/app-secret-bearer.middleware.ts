import { HttpException, Injectable, NestMiddleware } from '@nestjs/common';

import { NextFunction, Request, Response } from 'express';

import { CustomConfigService } from 'src/modules/config/config.service';

/**
 * A very simple middleware that checks, if an APP_SECRET has been defined for the service, that the request carries the same version of the secret that the app is running.
 */
@Injectable()
export class AppSecretBearerMiddleware implements NestMiddleware {
  secret: string;
  constructor({ security }: CustomConfigService) {
    this.secret = security.secret;
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (this.secret) {
      const token = req.headers['authorization']?.split(' ')[1];
      if (token !== this.secret) {
        throw new HttpException(
          {
            status: 426,
            error: 'Upgrade Required',
            message: 'Invalid app secret',
          },
          426,
        );
      }
    }

    next();
  }
}
