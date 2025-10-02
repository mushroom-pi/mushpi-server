// test/fixtures/pico-units.fixtures.ts
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { PicoUnit } from '../../src/modules/pico-units/pico-unit.entity';

export async function getPicoRepo(app: INestApplication) {
  return app.get<Repository<PicoUnit>>(getRepositoryToken(PicoUnit));
}

export async function clearPicoUnits(app: INestApplication) {
  const repo = await getPicoRepo(app);
  await repo.clear();
}

export async function seedPicoUnit(
  app: INestApplication,
  data: Partial<PicoUnit> = {},
) {
  const repo = await getPicoRepo(app);
  const entity = repo.create({
    handle: 'unit-' + Math.random().toString(16).slice(2, 6),
    host: '127.0.0.1',
    port: 5000,
    enabled: true,
    ...data,
  });
  return repo.save(entity);
}

export async function seedManyPicoUnits(
  app: INestApplication,
  count = 2,
  base: Partial<PicoUnit> = {},
) {
  const out: PicoUnit[] = [];
  for (let i = 0; i < count; i++) {
    // ensure unique host:port
    const unit = await seedPicoUnit(app, {
      host: base.host ?? `127.0.0.${i + 1}`,
      port: base.port ?? 5000 + i,
      handle: base.handle ?? `unit-${i + 1}`,
      name: base.name,
      description: base.description,
      enabled: base.enabled ?? true,
    });
    out.push(unit);
  }
  return out;
}
