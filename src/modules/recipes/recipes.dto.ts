import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';

import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_PAGE,
} from 'src/common/constants/pagination.constants';
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NOTES_MAX_LENGTH,
  STANDARD_TEXT_MAX_LENGTH,
} from 'src/common/constants/validation.constants';
import { PaginatedDto } from 'src/common/dto/paginated-response.dto';

import { Recipe } from './recipes.entity';

export class CreateRecipeDto {
  @ApiProperty({
    type: String,
    minLength: NAME_MIN_LENGTH,
    maxLength: NAME_MAX_LENGTH,
  })
  @IsString()
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({
    type: String,
    minLength: NAME_MIN_LENGTH,
    maxLength: STANDARD_TEXT_MAX_LENGTH,
  })
  @IsString()
  @Length(NAME_MIN_LENGTH, STANDARD_TEXT_MAX_LENGTH)
  species!: string;

  @ApiProperty({
    type: Number,
    minimum: TEMPERATURE_MIN,
    maximum: TEMPERATURE_MAX,
  })
  @IsInt()
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  temperature_target!: number;

  @ApiProperty({ type: Number, minimum: HUMIDITY_MIN, maximum: HUMIDITY_MAX })
  @IsInt()
  @Min(HUMIDITY_MIN)
  @Max(HUMIDITY_MAX)
  humidity_target!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  duration_days!: number;

  @ApiPropertyOptional({ type: String, maxLength: NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(0, NOTES_MAX_LENGTH)
  notes?: string;
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}

export class ListRecipesQueryDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: PAGINATION_MIN_PAGE,
    default: PAGINATION_DEFAULT_PAGE,
  })
  @IsOptional()
  @IsInt()
  @Min(PAGINATION_MIN_PAGE)
  page?: number = PAGINATION_DEFAULT_PAGE;

  @ApiPropertyOptional({
    type: Number,
    minimum: PAGINATION_MIN_LIMIT,
    maximum: PAGINATION_MAX_LIMIT,
    default: PAGINATION_DEFAULT_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(PAGINATION_MIN_LIMIT)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number = PAGINATION_DEFAULT_LIMIT;

  @ApiPropertyOptional({ type: String, description: 'Filter by species' })
  @IsOptional()
  @IsString()
  species?: string;
}

@ApiExtraModels(Recipe)
export class RecipeListResponseDto extends PaginatedDto(Recipe) {}

export class SetRecipeImageDto {
  @ApiPropertyOptional({ type: String, description: 'External image URL' })
  @IsOptional()
  @IsString()
  @IsUrl()
  url?: string;
}
