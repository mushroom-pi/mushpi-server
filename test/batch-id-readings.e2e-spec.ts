import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import request from 'supertest';
import { Repository } from 'typeorm';

import { Batch } from '../src/modules/batches/batches.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import { seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { seedReadingForUnit } from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('Batch readings endpoint (e2e)', () => {
  let app: INestApplication;
  let readingsRepo: Repository<Readings>;
  let batchRepo: Repository<Batch>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();

    readingsRepo = app.get(getRepositoryToken(Readings));
    batchRepo = app.get(getRepositoryToken(Batch));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    // clear DB state for isolation
    await readingsRepo.clear();
    await batchRepo.clear();
    await clearPicos(app); // also clears pico units via fixture helper
  });

  it('returns readings within the batch window when no query provided', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-1',
      port: 5400,
    });

    const base = Date.now();
    // create readings: before, inside (3), after
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 60000),
      temperature: 1,
    }); // -60s
    const r1 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
      temperature: 10,
    }); // -30s
    const r2 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
      temperature: 11,
    }); // -20s
    const r3 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 10000),
      temperature: 12,
    }); // -10s
    await seedReadingForUnit(app, pico, {
      ts: new Date(base + 10000),
      temperature: 2,
    }); // +10s

    // batch spans from r1.ts to r3.ts
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base - 10000),
      notes: 'span r1..r3',
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .expect(200);

    // should return r1, r2, r3 only (chronological)
    const ids = res.body.items.map((it: any) => it.id);
    expect(ids).toEqual([r1.id, r2.id, r3.id]);
    expect(res.body.total).toBe(3);
  });

  it('applies start/end inside batch window to narrow results', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-2',
      port: 5401,
    });

    const base = Date.now();
    const r1 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 40000),
    }); // -40
    const r2 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
    }); // -30
    const r3 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
    }); // -20
    const r4 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 10000),
    }); // -10

    // batch covers r1..r4
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 40000),
      finish_at: new Date(base - 10000),
    });

    // provide start between r1 and r2 => expect r2, r3, r4
    const startIso = new Date(r1.ts.getTime() + 5000).toISOString(); // r1 +5s
    const resStart = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: startIso })
      .expect(200);

    expect(resStart.body.items.map((it: any) => it.id)).toEqual([
      r2.id,
      r3.id,
      r4.id,
    ]);

    // provide end between r2 and r3 => expect r1,r2
    const endIso = new Date(r2.ts.getTime() + 5000).toISOString();
    const resEnd = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ end: endIso })
      .expect(200);

    expect(resEnd.body.items.map((it: any) => it.id)).toEqual([r1.id, r2.id]);

    // provide both start+end inside batch to get only r2,r3
    const start2 = new Date(r1.ts.getTime() + 5000).toISOString();
    const end2 = new Date(r3.ts.getTime() - 5000).toISOString();
    const resBoth = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: start2, end: end2 })
      .expect(200);

    expect(resBoth.body.items.map((it: any) => it.id)).toEqual([r2.id]);
  });

  it('clamps requested window outside batch to the batch window', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-3',
      port: 5402,
    });

    const base = Date.now();
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 80000),
    }); // -80s
    const r1 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 60000),
    }); // -60s
    const r2 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 40000),
    }); // -40s
    const r3 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
    }); // -20s
    await seedReadingForUnit(app, pico, {
      ts: new Date(base + 20000),
    }); // +20s

    // batch spans r1..r3 (-60s .. -20s)
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 60000),
      finish_at: new Date(base - 20000),
    });

    // request window wider than batch (start before batch, end after batch) -> clamped to batch: expect r1,r2,r3
    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({
        start: new Date(base - 120000).toISOString(), // -120s
        end: new Date(base + 60000).toISOString(), // +60s
      })
      .expect(200);

    expect(res.body.items.map((it: any) => it.id)).toEqual([
      r1.id,
      r2.id,
      r3.id,
    ]);
    expect(res.body.total).toBe(3);
  });

  it('returns 400 when requested window does not overlap the batch', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-4',
      port: 5403,
    });

    const base = Date.now();
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
    });

    // batch covers r1..r2
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base - 20000),
    });

    await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({
        start: new Date(base + 10000).toISOString(),
        end: new Date(base + 20000).toISOString(),
      })
      .expect(400);
  });

  it('returns 422 for invalid date format', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-5',
      port: 5404,
    });
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(),
      finish_at: new Date(Date.now() + 60000),
    });

    await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: 'invalid-date' })
      .expect(422);
  });

  it('returns 400 when start > end', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-6',
      port: 5405,
    });

    const base = Date.now();
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base + 30000),
    });

    const s = new Date(base + 20000).toISOString(); // in future of batch start
    const e = new Date(base - 20000).toISOString(); // before start -> s > e

    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: s, end: e })
      .expect(400);

    expect(res.body).toHaveProperty('statusCode', 400);
    expect(res.body).toHaveProperty('message');
  });

  it('returns newest-first when order=DESC (propagated from query)', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-unit-7',
      port: 5406,
    });

    const base = Date.now();
    const r1 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
      temperature: 10,
    });
    const r2 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
      temperature: 11,
    });
    const r3 = await seedReadingForUnit(app, pico, {
      ts: new Date(base - 10000),
      temperature: 12,
    });

    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base - 10000),
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ order: 'DESC' })
      .expect(200);

    const ids = res.body.items.map((it: any) => it.id);
    expect(ids).toEqual([r3.id, r2.id, r1.id]);
    expect(res.body.total).toBe(3);
  });
});
