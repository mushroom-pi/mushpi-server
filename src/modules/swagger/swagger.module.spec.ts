import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule as NestSwaggerModule,
  OpenAPIObject,
} from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';

import {
  READONLY_FORBIDDEN_DESCRIPTION,
  READONLY_FORBIDDEN_MESSAGE,
  READONLY_SPEC_EXTENSION,
} from 'src/common/constants/readonly.constants';

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
  isDemo = false;
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

  it('should brand the Swagger UI page with the Mushroom Pi site title and favicon', () => {
    // Pass-through spy: keeps the real setup() behaviour, records its args.
    const setupSpy = jest.spyOn(NestSwaggerModule, 'setup');

    swaggerModule.setupSwagger(app, {
      name: 'Test API',
      description: 'Test API Description',
      version: '1.0',
    });

    expect(setupSpy).toHaveBeenCalledWith(
      '/docs', // configService.docs.endpoint from MockCustomConfigService
      app,
      expect.anything(),
      expect.objectContaining({
        customSiteTitle: 'Mushroom Pi API — Swagger UI',
        customfavIcon: '/public/favicon.svg',
      }),
    );

    setupSpy.mockRestore();
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

  describe('429 global-error inclusion — documentsTooManyRequests', () => {
    // A SwaggerModule over a config stub covering only what the predicate
    // reads (isDemo + the historical pair), exactly as
    // `docsFlags` feeds validated values through CustomConfigService in
    // config.schema.spec.ts.
    const predicate = (
      isDemo: boolean,
      security: { maxRequests?: number; maxRequestsTime?: number },
    ) =>
      new SwaggerModule({
        isDemo,
        security,
      } as unknown as CustomConfigService)['documentsTooManyRequests']();

    it('documents 429 on a non-demo boot with the historical pair (unchanged behaviour)', () => {
      expect(
        predicate(false, { maxRequests: 40, maxRequestsTime: 60000 }),
      ).toBe(true);
    });

    it('does not document 429 on a non-demo boot without the pair (unchanged behaviour)', () => {
      expect(predicate(false, {})).toBe(false);
      expect(predicate(false, { maxRequests: 40 })).toBe(false);
      expect(predicate(false, { maxRequestsTime: 60000 })).toBe(false);
    });

    it('documents 429 on a demo boot even without the opt-in pair — the three demo throttlers are always armed', () => {
      expect(predicate(true, {})).toBe(true);
      // A demo boot that ALSO sets the historical pair stays documented.
      expect(predicate(true, { maxRequests: 40, maxRequestsTime: 60000 })).toBe(
        true,
      );
    });
  });

  describe('Demo read-only 403 injection', () => {
    const forbiddenContent = {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 403 },
            error: { type: 'string', example: 'Forbidden' },
            message: {
              type: 'string',
              example: READONLY_FORBIDDEN_MESSAGE,
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
    };

    const operation = (extension?: string) => ({
      tags: [],
      responses: {},
      ...(extension ? { [READONLY_SPEC_EXTENSION]: extension } : null),
    });

    function mockDocument(): OpenAPIObject {
      return {
        openapi: '3.0.0',
        info: { title: 'Test API', description: 'd', version: '1.0' },
        paths: {
          '/test': {
            parameters: [{ name: 'id', in: 'query' }],
            get: operation(),
            post: operation(),
            delete: operation(),
          },
          '/marked': {
            $ref: '#/components/pathItems/nope',
            get: operation('refused'),
            options: operation('refused'),
          },
          '/exempt': {
            post: operation('exempt'),
            put: operation('exempt'),
          },
          '/views': {
            get: operation(),
            head: operation(),
          },
        },
      } as unknown as OpenAPIObject;
    }

    it('injects 403 on an unmarked non-safe operation (the method default)', () => {
      const document = mockDocument();
      swaggerModule['addReadOnlyResponses'](document);

      expect(document.paths['/test'].post.responses['403']).toEqual({
        description: READONLY_FORBIDDEN_DESCRIPTION,
        content: forbiddenContent,
      });
      expect(document.paths['/test'].delete.responses['403']).toBeDefined();
    });

    it('injects 403 on a refused-marked safe-method operation', () => {
      const document = mockDocument();
      swaggerModule['addReadOnlyResponses'](document);

      expect(document.paths['/marked'].get.responses['403']).toEqual({
        description: READONLY_FORBIDDEN_DESCRIPTION,
        content: forbiddenContent,
      });
      expect(document.paths['/marked'].options.responses['403']).toBeDefined();
    });

    it('skips an unmarked safe-method operation', () => {
      const document = mockDocument();
      swaggerModule['addReadOnlyResponses'](document);

      expect(document.paths['/test'].get.responses['403']).toBeUndefined();
      expect(document.paths['/views'].get.responses['403']).toBeUndefined();
      expect(document.paths['/views'].head.responses['403']).toBeUndefined();
    });

    it('skips an exempt-marked operation even when its method is not safe', () => {
      const document = mockDocument();
      swaggerModule['addReadOnlyResponses'](document);

      expect(document.paths['/exempt'].post.responses['403']).toBeUndefined();
      expect(document.paths['/exempt'].put.responses['403']).toBeUndefined();
    });

    it('ignores non-method path-item keys', () => {
      const document = mockDocument();
      swaggerModule['addReadOnlyResponses'](document);

      expect(document.paths['/test'].parameters).toEqual([
        { name: 'id', in: 'query' },
      ]);
      expect((document.paths['/marked'] as any).$ref).toBe(
        '#/components/pathItems/nope',
      );
    });

    it('never mutates an existing 403 response', () => {
      const document = mockDocument();
      const existing = { description: 'already documented', content: {} };
      document.paths['/test'].post.responses['403'] = existing;

      swaggerModule['addReadOnlyResponses'](document);

      expect(document.paths['/test'].post.responses['403']).toBe(existing);
    });

    it('creates a responses map when the operation has none', () => {
      const document = mockDocument();
      (document.paths as any)['/test'].put = { tags: [] };

      swaggerModule['addReadOnlyResponses'](document);

      expect(
        (document.paths['/test'].put as any).responses['403'],
      ).toBeDefined();
    });
  });
});
