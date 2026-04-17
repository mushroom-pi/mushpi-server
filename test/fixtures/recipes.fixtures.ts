import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Recipe } from '../../src/modules/recipes/recipes.entity';

export async function getRecipeRepo(
  app: INestApplication,
): Promise<Repository<Recipe>> {
  return app.get(getRepositoryToken(Recipe));
}

export async function seedRecipe(
  app: INestApplication,
  data: Partial<Recipe> = {},
): Promise<Recipe> {
  const repo = await getRecipeRepo(app);
  const entity = repo.create({
    name: 'Recipe-' + Math.random().toString(16).slice(2, 8),
    species: 'oyster',
    temperature_target: 22,
    humidity_target: 80,
    duration_days: 14,
    notes: null,
    ...data,
  });
  return repo.save(entity);
}

export async function clearRecipes(app: INestApplication): Promise<void> {
  const repo = await getRecipeRepo(app);
  await repo.clear();
}
