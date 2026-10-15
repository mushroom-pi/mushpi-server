import { HttpStatus, Module } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule as NestSwaggerModule,
  OpenAPIObject,
} from '@nestjs/swagger';

import {
  DEMO_READONLY_FORBIDDEN_DESCRIPTION,
  DEMO_READONLY_FORBIDDEN_MESSAGE,
  DEMO_READONLY_SAFE_METHODS,
  DEMO_READONLY_SPEC_EXTENSION,
} from 'src/common/constants/demo-readonly.constants';

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

  /**
   * Demo read-only 403 injection — the OpenAPI projection of the same
   * declaration the runtime `DemoReadOnlyGuard` reads (see the mark
   * decorators under `src/common/decorators/docs/`).
   *
   * An operation gains the `403` response iff
   * `(method key is not safe OR it carries the refused mark)
   *  AND it does not carry the exempt mark`.
   *
   * Unlike the 429 global error (documented only when the *generating*
   * deployment has rate limiting configured), this injection is
   * **unconditional**: the committed spec is generated on pre-commit in a
   * dev/local boot and must document demo-mode behaviour regardless of the
   * generating environment. Runtime behaviour stays per-deployment — the
   * guard is inert unless `NODE_ENV=demo`.
   *
   * Pure addition: never mutates or removes existing entries.
   */
  private addDemoReadOnlyResponses(document: OpenAPIObject) {
    const safeMethodKeys = new Set(
      DEMO_READONLY_SAFE_METHODS.map((method) => method.toLowerCase()),
    );
    const methodKeys = [
      'get',
      'put',
      'post',
      'patch',
      'delete',
      'head',
      'options',
    ];

    for (const pathKey in document.paths) {
      const pathItem = document.paths[pathKey];

      for (const methodKey of methodKeys) {
        const operation = pathItem[methodKey];
        if (!operation) continue;

        const mark = (operation as Record<string, unknown>)[
          DEMO_READONLY_SPEC_EXTENSION
        ];
        if (mark === 'exempt') continue;

        const refused = !safeMethodKeys.has(methodKey) || mark === 'refused';
        if (!refused) continue;

        if (!operation.responses) {
          operation.responses = {};
        }
        if (operation.responses['403']) continue;

        operation.responses['403'] = {
          description: DEMO_READONLY_FORBIDDEN_DESCRIPTION,
          content: this.generateContent({
            statusCode: HttpStatus.FORBIDDEN,
            error: 'Forbidden',
            messageExample: DEMO_READONLY_FORBIDDEN_MESSAGE,
          }),
        };
      }
    }
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
        // OAS3 http-bearer scheme: the Authorization header is implicit;
        // `in`/`name` are Swagger 2.0 keys the 3.0 schema rejects.
        type: 'http',
        scheme: 'bearer',
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

    this.addDemoReadOnlyResponses(document);

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
        customSiteTitle: 'Mushroom Pi API — Swagger UI',
        customfavIcon: '/public/favicon.svg',
      },
    );
  }
}
