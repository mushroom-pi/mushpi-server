import {
  BadRequestException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import { Like, Repository } from 'typeorm';

import { IMAGE_ALLOWED_MIME_TYPES } from 'src/common/constants/upload.constants';
import { deleteImageFile } from 'src/common/utils/image-file.util';
import { buildImageUrl } from 'src/common/utils/image-url.util';
import { CustomConfigService } from 'src/modules/config/config.service';

import { RECIPE_IMAGE_RELATIVE_URL } from './recipes.constant';
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
    const recipe = await this.findOne(id);
    deleteImageFile(recipe.image, RECIPE_IMAGE_RELATIVE_URL);
    await this.recipeRepo.delete(id);
  }

  async setImage(
    recipe: Recipe,
    file: Express.Multer.File | undefined,
    dto: SetRecipeImageDto | undefined,
  ): Promise<Recipe> {
    let value: string;

    if (file) {
      value = file.filename;
    } else if (dto?.url) {
      await this.validateImageUrl(dto.url);
      value = dto.url;
    } else {
      throw new BadRequestException(
        'Provide an image file (multipart) or a url (JSON body)',
      );
    }

    deleteImageFile(recipe.image, RECIPE_IMAGE_RELATIVE_URL);
    recipe.image = value;
    const saved = await this.recipeRepo.save(recipe);
    return this.withImageUrl(saved);
  }

  async removeImage(recipe: Recipe): Promise<Recipe> {
    if (!recipe.image) {
      throw new NotFoundException('No image set for this recipe');
    }
    deleteImageFile(recipe.image, RECIPE_IMAGE_RELATIVE_URL);
    recipe.image = null;
    const saved = await this.recipeRepo.save(recipe);
    return this.withImageUrl(saved);
  }

  private withImageUrl(recipe: Recipe): Recipe {
    recipe.image_url = buildImageUrl(
      recipe.image,
      this.configService.baseUrl,
      RECIPE_IMAGE_RELATIVE_URL,
    );
    return recipe;
  }

  private withImagesUrl(recipes: Recipe[]): Recipe[] {
    return recipes.map((r) => this.withImageUrl(r));
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
