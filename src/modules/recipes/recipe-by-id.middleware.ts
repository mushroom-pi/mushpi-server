import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { NextFunction, Request, Response } from 'express';

import { RecipesService } from 'src/modules/recipes/recipes.service';

declare module 'express-serve-static-core' {
  interface Request {
    recipe?: import('src/modules/recipes/recipes.entity').Recipe;
  }
}

@Injectable()
export class RecipeByIdMiddleware implements NestMiddleware {
  constructor(private readonly recipes: RecipesService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const raw = (req.params as Record<string, string | undefined>)?.recipeId;
    const id = Number(raw);

    if (!raw || !Number.isFinite(id) || id <= 0) {
      return next(new UnprocessableEntityException('Invalid recipe id'));
    }

    try {
      const recipe = await this.recipes.findOne(id);
      req.recipe = recipe;
      return next();
    } catch {
      return next(new NotFoundException(`Recipe ${id} not found`));
    }
  }
}
