import { UnauthorizedException } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import basicAuth from 'express-basic-auth';
import helmet from 'helmet';
import hpp from 'hpp';
import { Logger } from 'nestjs-pino';
import toobusy from 'toobusy-js';

import { ExceptionsFilter } from './common/filters/exceptions.filter';
import { validationPipe } from './common/pipes/validation.pipe';
import { AppModule } from './modules/app.module';
import { CustomConfigService } from './modules/config/config.service';
import { SwaggerModule } from './modules/swagger/swagger.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const httpAdapterHost = app.get(HttpAdapterHost);

  const configService: CustomConfigService = app.get(CustomConfigService);

  // Security libraries
  if (configService.docs.ui && configService.docs.makeDocs)
    app.enableCors({ origin: configService.docs.ui });
  toobusy.maxLag(configService.security.maxEventLoopDelay);
  app.use(hpp());
  app.use(helmet());

  // Customized tools
  if (configService.docs.makeDocs) {
    /**
     * Adding the basic authentication for the documentation endpoint BEFORE the swaggerModule is created is pretty important. If you add the authentication after you create the endpoint, it won't work.
     */
    if (configService.docs.useAuth)
      app.use(
        '/' + configService.docs.endpoint + '*',
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

    const swaggerModule = new SwaggerModule(configService);
    swaggerModule.setupSwagger(app);
  }

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost, configService));
  app.useGlobalPipes(validationPipe);

  await app.listen(configService.server.port);
}
bootstrap();
