import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { Recipe } from 'src/modules/recipes/recipes.entity';

export const GetRecipe = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Recipe => {
    const req = ctx.switchToHttp().getRequest<{ recipe?: Recipe }>();
    return req.recipe as Recipe;
  },
);
