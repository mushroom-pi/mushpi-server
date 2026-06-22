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
  DESCRIPTION_MAX_LENGTH,
  NOTES_MAX_LENGTH,
} from 'src/common/constants/validation.constants';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { IMAGE_MAX_FILES_PER_BATCH, batchStatuses } from './batches.constant';
import { BatchStatus } from './batches.type';

@Entity('batch')
export class Batch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  @IsOptional()
  @IsDate()
  start_at!: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  @IsOptional()
  @IsDate()
  finish_at?: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  species?: string | null;

  @Column({ type: 'integer', nullable: true })
  @IsInt()
  @IsOptional()
  temperature_target?: number | null;

  @Column({ type: 'integer', nullable: true })
  @IsInt()
  @IsOptional()
  humidity_target?: number | null;

  @Column({ type: 'text', nullable: false, default: '' })
  @IsString()
  @IsOptional()
  @Length(0, NOTES_MAX_LENGTH)
  notes!: string;

  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  @Length(0, DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @Column({ type: 'simple-json', nullable: true, default: null })
  @ApiPropertyOptional({
    type: [String],
    description: 'Relative paths of attached images',
  })
  images?: string[] | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Absolute URLs to the batch images (computed)',
    example: ['http://localhost:3000/images/batches/7/1.jpg'],
  })
  images_url?: string[];

  @Index()
  @ManyToOne(() => PicoUnit, (u) => u.readings ?? undefined, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pico_unit_id' })
  pico_unit!: PicoUnit;

  @Column({ name: 'pico_unit_id', type: 'integer', nullable: false })
  @IsInt()
  pico_unit_id!: number;

  @Index()
  @ManyToOne(() => Recipe, (r) => r.batches ?? undefined, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'recipe_id' })
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
