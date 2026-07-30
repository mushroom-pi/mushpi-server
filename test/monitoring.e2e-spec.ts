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

    describe('database health (sqlite)', () => {
      it('should include sqlite database status when requested', async () => {
        const res = await request(app.getHttpServer())
          .get('/health')
          .query({ databases: 'sqlite', services: 'none', server: 'false' })
          .expect(200);

        expect(res.body).toHaveProperty('databases');
        expect(res.body.databases).toHaveProperty('sqlite');

        const sqlite = res.body.databases.sqlite;

        // Typical shape: { read, write, size }
        expect(typeof sqlite.read).toBe('boolean');
        expect(typeof sqlite.write).toBe('boolean');

        // With :memory: + synchronize:true, both should be true
        expect(sqlite.read).toBe(true);
        expect(sqlite.write).toBe(true);

        // Database size block
        expect(sqlite.size).toBeDefined();
        expect(sqlite.size.totalMb).toBeNull(); // :memory: in test env
        expect(sqlite.size.inMemory).toBe(true);
        expect(sqlite.size.path).toBe(':memory:');
        expect(sqlite.size.tables).toBeInstanceOf(Array);
        expect(sqlite.size.tables.length).toBeGreaterThan(0);
        const tableNames = sqlite.size.tables.map(
          (t: { name: string }) => t.name,
        );
        expect(tableNames).toContain('pico_unit');
        expect(tableNames).toContain('batch');
        expect(tableNames).toContain('readings');
      });

      it('should include server + sqlite when both requested', async () => {
        const res = await request(app.getHttpServer())
          .get('/health')
          .query({ server: 'true', databases: 'sqlite', services: 'none' })
          .expect(200);

        expect(res.body).toHaveProperty('server');
        expect(res.body).toHaveProperty('databases');
        expect(res.body.databases).toHaveProperty('sqlite');
      });
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics with status 200', () => {
      return request(app.getHttpServer()).get('/metrics').expect(200);
    });
  });

  describe('API versioning regression', () => {
    it('GET /v1/ping returns 404 (monitoring stays unversioned)', async () => {
      const res = await request(app.getHttpServer()).get('/v1/ping');
      expect(res.status).toBe(404);
    });

    it('GET /v1/health returns 404 (monitoring stays unversioned)', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health');
      expect(res.status).toBe(404);
    });
  });
});
