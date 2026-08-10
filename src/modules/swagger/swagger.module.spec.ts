import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule as NestSwaggerModule,
  OpenAPIObject,
} from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';

import { CustomConfigService } from '../config/config.service';
import { globalErrors } from './swagger-global-errors';
import { SwaggerModule } from './swagger.module';

// Mock the global errors
jest.mock('./swagger-global-errors', () => ({
  globalErrors: [
    {
      statusCode: 400,
      description: 'Bad Request',
      messageExample: 'Invalid request',
      overrideTag: 'no-internal',
    },
  ],
}));

// Mock CustomConfigService
class MockCustomConfigService {
  server = { port: 3000 };
  security = { maxRequests: 40, maxRequestsTime: 60 * 1000 };
  docs = { endpoint: '/docs' };
  errorsDetail = true;
}

describe('SwaggerModule', () => {
  let app: INestApplication;
  let swaggerModule: SwaggerModule;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CustomConfigService,
          useClass: MockCustomConfigService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    const configService =
      moduleFixture.get<CustomConfigService>(CustomConfigService);
    swaggerModule = new SwaggerModule(configService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should generate content correctly based on config', () => {
    const content = swaggerModule['generateContent']({
      statusCode: 400,
      error: 'Bad Request',
      messageExample: 'Invalid request',
    });

    expect(content).toEqual({
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            error: { type: 'string', example: 'Bad Request' },
            message: {
              type: 'string',
              example: 'Invalid request',
              description: 'The sort of error message you can expect',
            },
            emitter: {
              type: 'string',
              example: 'ErrorProducerModule',
              description:
                'If the error was produced within the codebase, the name of the module where it was created',
            },
            timestamp: {
              type: 'string',
              example: new Date(2024, 8, 15).toISOString(),
            },
            path: {
              type: 'string',
              example: '/path/of/the/failing/route',
              description:
                'Endpoint responsible for the production of the error',
            },
          },
        },
      },
    });
  });

  it('should correctly add error responses to document', () => {
    const document: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        description: 'Test API Description',
        version: '1.0',
      },
      paths: {
        '/test': {
          get: {
            tags: [],
            responses: {},
          },
        },
        '/noerror': {
          get: {
            tags: ['no-internal'],
            responses: {},
          },
        },
      },
    };

    const errorAdder = swaggerModule['errorResponseFactory']({
      statusCode: 400,
      error: 'Bad Request',
      description: 'Bad Request',
      messageExample: 'Invalid request',
      overrideTag: 'no-internal',
    });

    errorAdder(document);

    expect(document.paths['/test'].get.responses['400']).toEqual({
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              statusCode: { type: 'number', example: 400 },
              error: { type: 'string', example: 'Bad Request' },
              message: {
                type: 'string',
                example: 'Invalid request',
                description: 'The sort of error message you can expect',
              },
              emitter: {
                type: 'string',
                example: 'ErrorProducerModule',
                description:
                  'If the error was produced within the codebase, the name of the module where it was created',
              },
              timestamp: {
                type: 'string',
                example: new Date(2024, 8, 15).toISOString(),
              },
              path: {
                type: 'string',
                example: '/path/of/the/failing/route',
                description:
                  'Endpoint responsible for the production of the error',
              },
            },
          },
        },
      },
    });

    expect(document.paths['/noerror'].get.responses['400']).toBeUndefined();
  });

  it('should setup Swagger with global error responses', async () => {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Test API')
      .setDescription('Test API Description')
      .setVersion('1.0')
      .build();

    const document = NestSwaggerModule.createDocument(app, swaggerConfig);

    swaggerModule.setupSwagger(app, {
      name: 'Test API',
      description: 'Test API Description',
      version: '1.0',
    });

    globalErrors.forEach((errorResponse) => {
      const errorAdder = swaggerModule['errorResponseFactory'](errorResponse);
      errorAdder(document);
    });

    for (const pathKey in document.paths) {
      const path = document.paths[pathKey];
      for (const methodKey in path) {
        const method = path[methodKey];
        if (!method.tags.includes('no-internal')) {
          expect(method.responses['400']).toEqual({
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    statusCode: { type: 'number', example: 400 },
                    error: { type: 'string', example: 'Bad Request' },
                    message: {
                      type: 'string',
                      example: 'Invalid request',
                      description: 'The sort of error message you can expect',
                    },
                    emitter: {
                      type: 'string',
                      example: 'ErrorProducerModule',
                      description:
                        'If the error was produced within the codebase, the name of the module where it was created',
                    },
                    timestamp: {
                      type: 'string',
                      example: new Date(2024, 8, 15).toISOString(),
                    },
                    path: {
                      type: 'string',
                      example: '/path/of/the/failing/route',
                      description:
                        'Endpoint responsible for the production of the error',
                    },
                  },
                },
              },
            },
          });
        }
      }
    }
  });
});
