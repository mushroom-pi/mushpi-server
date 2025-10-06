import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

@Index('idx_readings_unit_ts', ['pico_unit_id', 'ts'])
@Entity('readings')
export class Readings {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  ts!: Date;

  @Column({ type: 'float', nullable: true })
  temperature?: number;

  @Column({ type: 'integer', nullable: true })
  humidity?: number;

  @Column({ type: 'text', nullable: true })
  last_sensor_err?: string;

  @Column({ type: 'boolean', default: false })
  fan_on!: boolean;

  @Column({ type: 'boolean', default: false })
  humidifier_on!: boolean;

  @Column({ type: 'boolean', default: false })
  heater_on!: boolean;

  @Column({ type: 'boolean', default: false })
  control_loop_enabled!: boolean;

  @Column({ type: 'integer', nullable: true })
  temperature_set?: number;

  @Column({ type: 'integer', nullable: true })
  humidity_set?: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  board_uptime_s!: number;

  @Column({ type: 'float', nullable: false, default: 0 })
  board_temp!: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  board_used_mem!: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  board_used_fs!: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  time_to_response_ms!: number;

  // --- Relation to PicoUnit ---
  @Index() // helpful for queries / joins
  @ManyToOne(() => PicoUnit, (u) => u.readings ?? undefined, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pico_unit_id' })
  pico_unit!: PicoUnit;

  @Column({ name: 'pico_unit_id', type: 'integer' })
  pico_unit_id!: number;
}
