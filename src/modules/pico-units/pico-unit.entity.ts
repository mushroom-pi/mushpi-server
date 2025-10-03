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

  @Expose()
  get address(): string {
    return `${this.host.includes('http://') ? '' : 'http://'}${this.host}:${this.port}`;
  }

  @OneToMany(() => Readings, (r) => r.pico_unit)
  readings?: Readings[];
}
