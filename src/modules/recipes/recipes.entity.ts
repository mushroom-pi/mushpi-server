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
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true, nullable: false })
  @IsString()
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH)
  name!: string;

  @Column({ type: 'text', nullable: false })
  @IsString()
  @Length(NAME_MIN_LENGTH, STANDARD_TEXT_MAX_LENGTH)
  species!: string;

  @Column({ type: 'integer', nullable: false })
  @IsInt()
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  temperature_target!: number;

  @Column({ type: 'integer', nullable: false })
  @IsInt()
  @Min(HUMIDITY_MIN)
  @Max(HUMIDITY_MAX)
  humidity_target!: number;

  @Column({ type: 'integer', nullable: false })
  @IsInt()
  @Min(1)
  duration_days!: number;

  @Column({ type: 'text', nullable: true, default: null })
  @IsString()
  @IsOptional()
  @Length(0, NOTES_MAX_LENGTH)
  notes?: string | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at!: Date;

  @OneToMany(() => Batch, (b) => b.recipe ?? undefined)
  batches?: Batch[];
}
