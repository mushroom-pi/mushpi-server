import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Batch } from '../../src/modules/batches/batches.entity';

export async function getBatchRepo(
  app: INestApplication,
): Promise<Repository<Batch>> {
  return app.get(getRepositoryToken(Batch));
}

export async function seedBatch(
  app: INestApplication,
  pico_unit_id: number,
  data: Partial<Batch> = {},
) {
  const repo = await getBatchRepo(app);
  const entity = repo.create({
    pico_unit_id,
    start_at: data.start_at ?? new Date(),
    finish_at: data.finish_at ?? null,
    species: data.species ?? null,
    temperature_target: data.temperature_target ?? null,
    humidity_target: data.humidity_target ?? null,
    notes: data.notes ?? '',
    recipe_id: data.recipe_id ?? null,
  } as Partial<Batch>);
  return repo.save(entity);
}

export async function clearBatches(app: INestApplication) {
  const repo = await getBatchRepo(app);
  await repo.clear();
}
