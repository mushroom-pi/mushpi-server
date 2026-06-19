import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';
import { Observable } from 'rxjs';

import {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_FILE_SIZE,
} from 'src/common/constants/upload.constants';
import { RECIPE_IMAGE_UPLOAD_DIR } from 'src/modules/recipes/recipes.constant';
import { Recipe } from 'src/modules/recipes/recipes.entity';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const recipeImageMulterOptions = {
  storage: diskStorage({
    destination: RECIPE_IMAGE_UPLOAD_DIR,
    filename: (
      req: any,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void,
    ) => {
      const recipe = req.recipe as Recipe;
      const ext = MIME_TO_EXT[file.mimetype] || 'bin';
      cb(null, `${recipe.id}.${ext}`);
    },
  }),
  limits: { fileSize: IMAGE_MAX_FILE_SIZE },
  fileFilter: (
    _req: any,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!IMAGE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new BadRequestException(
          `Invalid file type. Allowed: ${IMAGE_ALLOWED_MIME_TYPES.join(', ')}`,
        ),
        false,
      );
    }
    cb(null, true);
  },
};

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
