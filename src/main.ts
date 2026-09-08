import {
  ClassSerializerInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import basicAuth from 'express-basic-auth';
import helmet from 'helmet';
import hpp from 'hpp';
import { Logger } from 'nestjs-pino';
import toobusy from 'toobusy-js';

import { ExceptionsFilter } from './common/filters/exceptions.filter';
import { AppSecretBearerMiddleware } from './common/middleware/app-secret-bearer.middleware';
import { ProtectEventLoopMiddleware } from './common/middleware/protect-event-loop.middleware';
import { validationPipe } from './common/pipes/validation.pipe';
import { applyApiVersioning } from './common/utils/api-version';
import { AppModule } from './modules/app.module';
import { CustomConfigService } from './modules/config/config.service';
import { SwaggerModule } from './modules/swagger/swagger.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const httpAdapterHost = app.get(HttpAdapterHost);

  const configService: CustomConfigService = app.get(CustomConfigService);

  applyApiVersioning(app);

  // Security libraries
  /** CORS-settings */
  const origin = [configService.client.clientUrl];
  if (configService.docs.makeDocs && configService.docs.ui)
    origin.push(configService.docs.ui);
  app.enableCors({ origin, credentials: true });

  /** General safeguards */
  toobusy.maxLag(configService.security.maxEventLoopDelay);
  app.use(hpp());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        },
      },
    }),
  );

  /** Global Nest middleware — registered via app.use() to bypass route versioning */
  const protectEventLoop = new ProtectEventLoopMiddleware(configService);
  const appSecretBearer = new AppSecretBearerMiddleware(configService);
  app.use(protectEventLoop.use.bind(protectEventLoop));
  app.use(appSecretBearer.use.bind(appSecretBearer));

  // Customized tools
  if (configService.docs.makeDocs) {
    /**
     * Adding the basic authentication for the documentation endpoint BEFORE the swaggerModule is created is pretty important. If you add the authentication after you create the endpoint, it won't work.
     */
    if (configService.docs.useAuth)
      app.use(
        '/' + configService.docs.endpoint + '{*splat}',
        basicAuth({
          challenge: true,
          users: {
            [configService.docs.username]: configService.docs.password,
          },
          unauthorizedResponse: new UnauthorizedException(
            'Invalid credentials',
          ),
        }),
      );

    const swaggerModule = app.get(SwaggerModule);
    swaggerModule.setupSwagger(app);
  }

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost, configService));
  app.useGlobalPipes(validationPipe);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  await app.listen(configService.server.port);
}
bootstrap();
