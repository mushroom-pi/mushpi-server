import { HttpStatus, Module } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule as NestSwaggerModule,
  OpenAPIObject,
} from '@nestjs/swagger';

import { description, name, version } from '../../../package.json';
import { CustomConfigService } from '../config/config.service';
import { globalErrors } from './swagger-global-errors';
import {
  DocumentDescriptor,
  ErrorProperties,
  ErrorResponseInput,
} from './swagger.interface';
import { ErrorResponseAdder } from './swagger.type';

@Module({})
export class SwaggerModule {
  constructor(private readonly configService: CustomConfigService) {}

  private generateContent({
    statusCode,
    error,
    messageExample,
  }: Omit<ErrorResponseInput, 'overrideTag' | 'description'>) {
    const properties: ErrorProperties = {
      statusCode: { type: 'number', example: statusCode },
      error: { type: 'string', example: error },
      message: {
        type: 'string',
        example: messageExample,
        description: 'The sort of error message you can expect',
      },
    };

    if (this.configService.errorsDetail) {
      properties.emitter = {
        type: 'string',
        example: 'ErrorProducerModule',
        description:
          'If the error was produced within the codebase, the name of the module where it was created',
      };
      properties.timestamp = {
        type: 'string',
        example: new Date(2024, 8, 15).toISOString(),
      };
      properties.path = {
        type: 'string',
        example: '/path/of/the/failing/route',
        description: 'Endpoint responsible for the production of the error',
      };
    }

    return {
      'application/json': {
        schema: {
          type: 'object',
          properties,
        },
      },
    };
  }

  private errorResponseFactory({
    statusCode,
    error,
    description,
    messageExample,
    overrideTag,
  }: ErrorResponseInput): ErrorResponseAdder {
    const content = this.generateContent({
      statusCode,
      error,
      messageExample,
    });

    return function addErrorResponseToAllEndpoints(document: OpenAPIObject) {
      for (const pathKey in document.paths) {
        const path = document.paths[pathKey];

        for (const methodKey in path) {
          const method = document.paths[pathKey][methodKey];
          if (!method.responses) {
            method.responses = {};
          }
          if (!method.tags.includes(overrideTag))
            method.responses[String(statusCode)] = {
              description,
              content,
            };
        }
      }
    };
  }

  public buildOpenApiDocument(
    app: INestApplication,
    documentDescriptor?: DocumentDescriptor,
    opts?: { appendEnvSuffix?: boolean },
  ): OpenAPIObject {
    const appendEnvSuffix = opts?.appendEnvSuffix ?? true;
    const title = appendEnvSuffix
      ? `${documentDescriptor?.name || name} ${this.configService.server.nodeEnv?.toUpperCase()}`
      : documentDescriptor?.name || name;

    const swaggerConfig = new DocumentBuilder()
      .addSecurity('secret', {
        type: 'http',
        scheme: 'bearer',
        in: 'header',
        name: 'authorization',
      })
      .setTitle(title)
      .setDescription(documentDescriptor?.description || description)
      .setVersion(documentDescriptor?.version || version)
      .addTag(
        'monitoring',
        "Check the health of the microservice and it's dependencies",
      )
      .build();

    const document = NestSwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (
        controllerKey: string,
        methodKey: string,
        version?: string,
      ) => {
        // Strip V1 suffix from controller class names in operationIds.
        // Controller files/classes carry V1 for code organisation, but the
        // generated client contract should not encode it redundantly —
        // the version is already in the URL path and the _v1 operationId suffix.
        const cleanKey = controllerKey.replace(/V1(?=Controller)/, '');
        if (version) {
          return `${cleanKey}_${methodKey}_${version}`;
        }
        return `${cleanKey}_${methodKey}`;
      },
    });

    globalErrors
      .filter((errorResponse) => {
        /**
         * Display the documentation for the Too many requests response only if rate limiting is active in the platform
         */
        if (
          !this.configService.security.maxRequests ||
          !this.configService.security.maxRequestsTime
        )
          return errorResponse.statusCode !== HttpStatus.TOO_MANY_REQUESTS;

        return true;
      })
      .filter((errorResponse) => {
        /**
         * Display the documentation for the Invalid app secret only if the APP_SECRET has been defined in the first place
         */
        if (!this.configService.security.secret)
          return errorResponse.statusCode !== 426;

        return true;
      })
      .forEach((errorResponse) =>
        this.errorResponseFactory(errorResponse)(document),
      );

    return document;
  }

  setupSwagger(
    app: INestApplication,
    documentDescriptor?: DocumentDescriptor,
    endpoint?: string,
  ) {
    const document = this.buildOpenApiDocument(app, documentDescriptor, {
      appendEnvSuffix: true,
    });

    NestSwaggerModule.setup(
      endpoint || this.configService.docs.endpoint,
      app,
      document,
      {
        customSiteTitle: `${documentDescriptor?.name || name.replace('be-', '').toUpperCase()} Microservice Swagger UI`,
      },
    );
  }
}
