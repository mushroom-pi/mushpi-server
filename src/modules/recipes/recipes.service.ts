import {
  BadRequestException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Like, Repository } from 'typeorm';

import { IMAGE_ALLOWED_MIME_TYPES } from 'src/common/constants/upload.constants';
import { CustomConfigService } from 'src/modules/config/config.service';

import {
  RECIPE_IMAGE_RELATIVE_URL,
  RECIPE_IMAGE_UPLOAD_DIR,
} from './recipes.constant';
import {
  CreateRecipeDto,
  ListRecipesQueryDto,
  SetRecipeImageDto,
  UpdateRecipeDto,
} from './recipes.dto';
import { Recipe } from './recipes.entity';

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
    private readonly configService: CustomConfigService,
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
      items: this.withImagesUrl(items),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException(`Recipe ${id} not found`);
    return this.withImageUrl(recipe);
  }

  async create(dto: CreateRecipeDto): Promise<Recipe> {
    const recipe = this.recipeRepo.create(dto);
    const saved = await this.recipeRepo.save(recipe);
    return this.withImageUrl(saved);
  }

  async update(recipe: Recipe, dto: UpdateRecipeDto): Promise<Recipe> {
    Object.assign(recipe, dto);
    const saved = await this.recipeRepo.save(recipe);
    return this.withImageUrl(saved);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.recipeRepo.delete(id);
  }

  async setImage(
    recipe: Recipe,
    file: Express.Multer.File | undefined,
    dto: SetRecipeImageDto | undefined,
  ): Promise<Recipe> {
    let value: string;

    if (file) {
      value = `${RECIPE_IMAGE_RELATIVE_URL}/${file.filename}`;
    } else if (dto?.url) {
      await this.validateImageUrl(dto.url);
      value = dto.url;
    } else {
      throw new BadRequestException(
        'Provide an image file (multipart) or a url (JSON body)',
      );
    }

    this.deleteOldImageFile(recipe);
    recipe.image = value;
    const saved = await this.recipeRepo.save(recipe);
    return this.withImageUrl(saved);
  }

  async removeImage(recipe: Recipe): Promise<Recipe> {
    if (!recipe.image) {
      throw new NotFoundException('No image set for this recipe');
    }
    this.deleteOldImageFile(recipe);
    recipe.image = null;
    const saved = await this.recipeRepo.save(recipe);
    return this.withImageUrl(saved);
  }

  private isExternalUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://');
  }

  private withImageUrl(recipe: Recipe): Recipe {
    if (!recipe.image) {
      recipe.image_url = null;
    } else if (this.isExternalUrl(recipe.image)) {
      recipe.image_url = recipe.image;
    } else {
      recipe.image_url = `${this.configService.baseUrl}${recipe.image}`;
    }
    return recipe;
  }

  private withImagesUrl(recipes: Recipe[]): Recipe[] {
    return recipes.map((r) => this.withImageUrl(r));
  }

  private deleteOldImageFile(recipe: Recipe): void {
    if (!recipe.image) return;
    if (this.isExternalUrl(recipe.image)) return;
    const filename = recipe.image.replace('/images/recipes/', '');
    const filePath = path.join(RECIPE_IMAGE_UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  private async validateImageUrl(url: string): Promise<void> {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      if (response.status >= 400) {
        throw new NotAcceptableException(
          `The provided URL is not accessible (HTTP ${response.status})`,
        );
      }

      const contentType = response.headers['content-type']?.toLowerCase() ?? '';
      const isImage = IMAGE_ALLOWED_MIME_TYPES.some((mime) =>
        contentType.includes(mime),
      );

      if (!isImage) {
        throw new NotAcceptableException(
          `The provided URL does not point to a valid image. Content-Type: ${contentType || 'unknown'}. Allowed types: ${IMAGE_ALLOWED_MIME_TYPES.join(', ')}`,
        );
      }
    } catch (error) {
      if (error instanceof NotAcceptableException) {
        throw error;
      }
      throw new NotAcceptableException(
        'The provided URL is not accessible or is blocked by CORS',
      );
    }
  }
}
