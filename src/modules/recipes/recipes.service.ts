import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Like, Repository } from 'typeorm';

import {
  CreateRecipeDto,
  ListRecipesQueryDto,
  UpdateRecipeDto,
} from './recipes.dto';
import { Recipe } from './recipes.entity';

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
  ) {}

  async findAll(query: ListRecipesQueryDto) {
    const { page = 1, limit = 20, species } = query;

    const [items, total] = await this.recipeRepo.findAndCount({
      where: species ? { species: Like(`%${species}%`) } : {},
      order: { name: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException(`Recipe ${id} not found`);
    return recipe;
  }

  async create(dto: CreateRecipeDto): Promise<Recipe> {
    const recipe = this.recipeRepo.create(dto);
    return this.recipeRepo.save(recipe);
  }

  async update(recipe: Recipe, dto: UpdateRecipeDto): Promise<Recipe> {
    Object.assign(recipe, dto);
    return this.recipeRepo.save(recipe);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.recipeRepo.delete(id);
  }
}
