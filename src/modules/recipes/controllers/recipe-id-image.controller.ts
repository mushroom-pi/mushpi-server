import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Response } from 'express';

import { ApiRecipeImageErrors } from 'src/common/decorators/docs/api-recipe-image.decorator';
import { ApiRecipe } from 'src/common/decorators/docs/api-recipe.decorator';
import { GetRecipe } from 'src/common/decorators/get-recipe.decorator';
import { RecipeImageUploadInterceptor } from 'src/common/interceptors/recipe-image-upload.interceptor';

import { SetRecipeImageDto } from '../recipes.dto';
import { Recipe } from '../recipes.entity';
import { RecipesService } from '../recipes.service';

@ApiTags('recipes', 'images')
@Controller('recipes/:recipeId/image')
@ApiRecipe()
export class RecipeIdImageController {
  constructor(private readonly svc: RecipesService) {}

  @Put()
  @ApiOperation({ summary: 'Upload or set recipe image' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG or PNG, max 5MB)',
        },
        url: { type: 'string', description: 'External image URL' },
      },
    },
  })
  @ApiOkResponse({ type: Recipe, description: 'Image set successfully' })
  @ApiRecipeImageErrors()
  @UseInterceptors(RecipeImageUploadInterceptor)
  setImage(
    @GetRecipe() recipe: Recipe,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SetRecipeImageDto,
  ) {
    return this.svc.setImage(recipe, file, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get recipe image' })
  @ApiOkResponse({
    description: 'Returns the image file or redirects to external URL',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiRecipeImageErrors()
  getImage(@GetRecipe() recipe: Recipe, @Res() res: Response) {
    const result = this.svc.getImage(recipe);

    if (result.isUrl) {
      return res.redirect(result.value);
    }

    return res.sendFile(result.filePath!);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove recipe image' })
  @ApiNoContentResponse({ description: 'Image removed successfully' })
  @ApiRecipeImageErrors()
  removeImage(@GetRecipe() recipe: Recipe) {
    return this.svc.removeImage(recipe);
  }
}
