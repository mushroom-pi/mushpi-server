import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { nodeEnvironments } from '../src/modules/config/config.constants';
import { closeTestApp, createTestApp } from './test-setup';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterEach(async () => {
    await closeTestApp(app);
  });

  describe('for NODE_ENV', () => {
    it('should throw an error if NODE_ENV is invalid', async () => {
      process.env.NODE_ENV = 'invalid'; // Set an invalid NODE_ENV

      try {
        await app.init(); // Try to initialize the app
      } catch (error) {
        expect(error.message).toContain(
          `NODE_ENV must be one of ${nodeEnvironments}`,
        );
      }
    });

    nodeEnvironments.forEach((env) => {
      it(`should start the app correctly when NODE_ENV is ${env}`, async () => {
        process.env.NODE_ENV = env;
        await app.init();
        expect(app).toBeDefined();
        await app.close();
      });
    });
  });

  describe('ERRORS', () => {
    const invalidEndpoint = '/health?server=invalid';

    describe('with ERRORS_DETAIL undefined', () => {
      it('should return a full error', async () => {
        await request(app.getHttpServer())
          .get(invalidEndpoint)
          .expect(422)
          .expect((response) => {
            expect(response.body).toHaveProperty('statusCode', 422);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty(
              'error',
              'Unprocessable Entity',
            );
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('path', invalidEndpoint);
            expect(response.body).toHaveProperty('emitter');
          });
      });
    });

    describe('with ERRORS_DETAIL=false', () => {
      beforeAll(async () => {
        process.env.ERRORS_DETAIL = 'false';
      });

      it('should return return stripped error', async () => {
        const { body } = await request(app.getHttpServer())
          .get(invalidEndpoint)
          .expect(422);

        expect(body).toHaveProperty('statusCode', 422);
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('error', 'Unprocessable Entity');
        expect(body).not.toHaveProperty('timestamp');
        expect(body).not.toHaveProperty('path');
        expect(body).not.toHaveProperty('emitter');
      });
    });
  });

  describe('APP_SECRET', () => {
    const pingEndpoint = '/ping';
    const appSecret = 'testing_secret';

    describe('defined', () => {
      beforeAll(async () => {
        process.env.APP_SECRET = appSecret;
      });

      afterAll(() => {
        process.env.APP_SECRET = undefined;
      });

      it('should return a 426 error when no secret is provided', async () => {
        await request(app.getHttpServer()).get(pingEndpoint).expect(426);
      });

      it('should allow usage when the secret is included in headers', async () => {
        await request(app.getHttpServer())
          .get(pingEndpoint)
          .set('authorization', `Bearer ${appSecret}`)
          .expect(200);
      });
    });
  });
});
