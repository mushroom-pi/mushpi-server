import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NOTES_MAX_LENGTH,
  STANDARD_TEXT_MAX_LENGTH,
} from 'src/common/constants/validation.constants';
import { Batch } from 'src/modules/batches/batches.entity';

@Entity('recipe')
export class Recipe {
  @ApiProperty({ description: 'Unique recipe id', example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({
    description: 'Recipe name (unique)',
    example: 'Oyster Mushroom Kit',
  })
  @Column({ type: 'text', unique: true, nullable: false })
  @IsString()
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({
    description: 'Species/cultivar this recipe targets',
    example: 'Pleurotus ostreatus',
  })
  @Column({ type: 'text', nullable: false })
  @IsString()
  @Length(NAME_MIN_LENGTH, STANDARD_TEXT_MAX_LENGTH)
  species!: string;

  @ApiProperty({
    type: 'integer',
    minimum: TEMPERATURE_MIN,
    maximum: TEMPERATURE_MAX,
    description: 'Target temperature in °C',
    example: 22,
  })
  @Column({ type: 'integer', nullable: false })
  @IsInt()
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  temperature_target!: number;

  @ApiProperty({
    type: 'integer',
    minimum: HUMIDITY_MIN,
    maximum: HUMIDITY_MAX,
    description: 'Target humidity in %',
    example: 85,
  })
  @Column({ type: 'integer', nullable: false })
  @IsInt()
  @Min(HUMIDITY_MIN)
  @Max(HUMIDITY_MAX)
  humidity_target!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'Expected cultivation duration in days',
    example: 14,
  })
  @Column({ type: 'integer', nullable: false })
  @IsInt()
  @Min(1)
  duration_days!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Free-form cultivator notes',
    example: 'Mist twice daily during pinning',
  })
  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  @Length(0, NOTES_MAX_LENGTH)
  notes?: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Filename of the uploaded image or external URL',
    example: '1.jpg',
  })
  image?: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Relative URL to the image (resolve against the API origin); external URLs are returned as-is',
    example: '/images/recipes/1.jpg',
  })
  image_url?: string | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-07-31T10:30:00.000Z',
  })
  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-08-02T08:12:00.000Z',
  })
  @UpdateDateColumn({ type: 'datetime' })
  updated_at!: Date;

  @OneToMany(() => Batch, (b) => b.recipe ?? undefined)
  batches?: Batch[];
}
