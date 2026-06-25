import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import * as fs from 'fs';
import { Observable } from 'rxjs';

import { CustomConfigService } from 'src/modules/config/config.service';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { MIME_TO_EXT, buildImageMulterOptions } from './image-upload.helpers';

@Injectable()
export class RecipeImageUploadInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor(private readonly configService: CustomConfigService) {
    const recipeImageMulterOptions = buildImageMulterOptions({
      destination: (_req: any, _file: Express.Multer.File, cb: any) => {
        const dir = `${this.configService.upload.imageDir}/recipes`;
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req: any, file: Express.Multer.File, cb) => {
        const recipe = req.recipe as Recipe;
        const ext = MIME_TO_EXT[file.mimetype] || 'bin';
        cb(null, `${recipe.id}.${ext}`);
      },
    });
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
