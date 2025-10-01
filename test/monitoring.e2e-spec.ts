import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { createTestApp } from './test-setup';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  describe('GET /ping', () => {
    it('should return "pong" with status 200', () => {
      return request(app.getHttpServer())
        .get('/ping')
        .expect(200)
        .expect('pong');
    });
  });

  describe('GET /health', () => {
    describe('without any query parameters', () => {
      it('should return health checks with status 200', () => {
        return request(app.getHttpServer()).get('/health').expect(200);
      });
    });

    describe('with valid query paramenters', () => {
      it('should return health checks with status 200', () => {
        return request(app.getHttpServer())
          .get('/health')
          .query({ server: 'true', databases: 'all', services: 'none' })
          .expect(200);
      });
    });

    describe('with invalid query parameters', () => {
      it('should return an error for invalid query parameters with status 422', async () => {
        const response = await request(app.getHttpServer())
          .get('/health')
          .query({
            server: 'invalid',
            databases: 'invalid',
            services: 'all,none',
          });

        expect(response.status).toBe(422); // Unprocessable Entity
        expect(response.body).toHaveProperty('message');
        expect(response.body.message[0]).toContain(
          'server has wrong value invalid',
        );
        expect(response.body.message[1]).toContain(
          "databases must be 'all', 'none', or a comma-separated list of valid values",
        );
        expect(response.body.message[2]).toContain(
          "services must be 'all', 'none', or a comma-separated list of valid values",
        );
      });
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics with status 200', () => {
      return request(app.getHttpServer()).get('/metrics').expect(200);
    });
  });
});
