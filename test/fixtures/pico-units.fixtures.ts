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
    micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
    software_version: '0.1.1',
    board: 'Raspberry Pi Pico 2 W with RP2350',
    board_cpu_freq_mhz: 150,
    board_total_fs_byte: 457152,
    board_total_mem_byte: 2621440,
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
