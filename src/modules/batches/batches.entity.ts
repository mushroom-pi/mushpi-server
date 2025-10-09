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

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import { BatchStatus } from './batches.type';

@Entity('batch')
export class Batch {
  @PrimaryGeneratedColumn()
  id!: number;

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
  @Length(0, 2000)
  notes!: string;

  @Expose()
  get status(): BatchStatus {
    // if finish_at is null or in the future => in-progress; otherwise finished
    if (!this.finish_at) return 'in-progress';
    return this.finish_at.getTime() > Date.now() ? 'in-progress' : 'finished';
  }
}
