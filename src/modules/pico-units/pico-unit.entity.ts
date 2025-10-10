import { Expose } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Readings } from '../readings/readings.entity';

@Entity('pico_unit')
@Index(['host', 'port'], { unique: true })
export class PicoUnit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'text', nullable: false })
  handle!: string;

  @Column({ type: 'text', nullable: true })
  name?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: false })
  host!: string;

  @Column({ type: 'integer', default: 5000 })
  port!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'datetime', nullable: true })
  last_seen?: Date;

  @Column({ type: 'text', nullable: true })
  micropython_version?: string;

  @Column({ type: 'text', nullable: true })
  software_version?: string;

  @Column({ type: 'text', nullable: true })
  board?: string;

  @Column({ type: 'integer', nullable: true, default: 0 })
  board_total_mem_byte?: number;

  @Column({ type: 'integer', nullable: true, default: 0 })
  board_total_fs_byte?: number;

  @Column({ type: 'integer', nullable: true, default: 0 })
  board_cpu_freq_mhz?: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  failed_calls!: number;

  @Expose()
  get address(): string {
    return `${this.host.includes('http://') ? '' : 'http://'}${this.host}:${this.port}`;
  }

  @OneToMany(() => Readings, (r) => r.pico_unit)
  readings?: Readings[];

  latest_reading?: Readings;
}
