import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Expose } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Length } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import {
  DESCRIPTION_MAX_LENGTH,
  NOTES_MAX_LENGTH,
} from 'src/common/constants/validation.constants';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { IMAGE_MAX_FILES_PER_BATCH, batchStatuses } from './batches.constant';
import { BatchStatus } from './batches.type';

@Entity('batch')
export class Batch {
  @ApiProperty({ description: 'Unique batch id', example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({
    description: 'Batch start timestamp',
    example: '2026-08-01T00:00:00.000Z',
  })
  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  @IsOptional()
  @IsDate()
  start_at!: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Batch finish timestamp (null = open-ended batch)',
  })
  @Column({ type: 'datetime', nullable: true, default: null })
  @IsOptional()
  @IsDate()
  finish_at?: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Species snapshot copied from the recipe at batch creation',
    example: 'Pleurotus ostreatus',
  })
  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  species?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: TEMPERATURE_MIN,
    maximum: TEMPERATURE_MAX,
    description: 'Temperature target snapshot in °C',
    example: 22,
  })
  @Column({ type: 'integer', nullable: true })
  @IsInt()
  @IsOptional()
  temperature_target?: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: HUMIDITY_MIN,
    maximum: HUMIDITY_MAX,
    description: 'Humidity target snapshot in %',
    example: 85,
  })
  @Column({ type: 'integer', nullable: true })
  @IsInt()
  @IsOptional()
  humidity_target?: number | null;

  @ApiProperty({
    description: 'Batch cultivation notes',
    example: 'Second flush — heavier misting',
  })
  @Column({ type: 'text', nullable: false, default: '' })
  @IsString()
  @IsOptional()
  @Length(0, NOTES_MAX_LENGTH)
  notes!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Short batch description',
    example: 'Shelf A run #3',
  })
  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  @Length(0, DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @Column({ type: 'simple-json', nullable: true, default: null })
  @ApiPropertyOptional({
    type: [String],
    description: 'Filenames of attached images',
  })
  images?: string[] | null;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Relative URLs to the batch images (resolve against the API origin); computed',
    example: ['/images/batches/7/1.jpg'],
  })
  images_url?: string[];

  @Index()
  @ManyToOne(() => PicoUnit, (u) => u.readings ?? undefined, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pico_unit_id' })
  @ApiPropertyOptional({
    type: () => PicoUnit,
    description:
      'Expanded pico unit (loaded by list/detail endpoints; omitted on unit-scoped batch lists)',
  })
  pico_unit!: PicoUnit;

  @ApiProperty({
    type: 'integer',
    description: 'Id of the pico unit this batch runs on',
    example: 1,
  })
  @Column({ name: 'pico_unit_id', type: 'integer', nullable: false })
  @IsInt()
  pico_unit_id!: number;

  @Index()
  @ManyToOne(() => Recipe, (r) => r.batches ?? undefined, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'recipe_id' })
  @ApiPropertyOptional({
    type: () => Recipe,
    nullable: true,
    description:
      'Expanded recipe (loaded by list/detail endpoints; null when no recipe is linked)',
  })
  recipe?: Recipe | null;

  @Column({ name: 'recipe_id', type: 'integer', nullable: true, default: null })
  @IsInt()
  @IsOptional()
  recipe_id?: number | null;

  @Expose()
  @ApiProperty({
    enum: batchStatuses,
    description:
      'Current status of the batch (computed from start_at and finish_at)',
    example: 'in-progress',
  })
  get status(): BatchStatus {
    // if start_at is in the future => planned
    if (this.start_at.getTime() > Date.now()) return 'planned';
    // if finish_at is null or in the future => in-progress; otherwise finished
    if (!this.finish_at) return 'in-progress';
    return this.finish_at.getTime() > Date.now() ? 'in-progress' : 'finished';
  }

  @Expose()
  @ApiProperty({
    type: Number,
    description: 'Number of images that can still be uploaded to this batch',
    example: 3,
    minimum: 0,
    maximum: IMAGE_MAX_FILES_PER_BATCH,
  })
  get images_left(): number {
    return IMAGE_MAX_FILES_PER_BATCH - (this.images?.length ?? 0);
  }
}
