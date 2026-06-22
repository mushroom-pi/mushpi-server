import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Observable } from 'rxjs';

import { RECIPE_IMAGE_UPLOAD_DIR } from 'src/modules/recipes/recipes.constant';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { MIME_TO_EXT, buildImageMulterOptions } from './image-upload.helpers';

const recipeImageMulterOptions = buildImageMulterOptions({
  destination: RECIPE_IMAGE_UPLOAD_DIR,
  filename: (req: any, file: Express.Multer.File, cb) => {
    const recipe = req.recipe as Recipe;
    const ext = MIME_TO_EXT[file.mimetype] || 'bin';
    cb(null, `${recipe.id}.${ext}`);
  },
});

@Injectable()
export class RecipeImageUploadInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor() {
    const InterceptorClass = FileInterceptor('image', recipeImageMulterOptions);
    this.delegate = new InterceptorClass();
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> | Promise<Observable<any>> {
    return this.delegate.intercept(context, next);
  }
}
