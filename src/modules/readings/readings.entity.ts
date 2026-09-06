import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Temperature in °C (null when the sensor returned no data)',
    example: 22.5,
  })
  @Column({ type: 'float', nullable: true })
  temperature?: number;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Humidity in % (null when the sensor returned no data)',
    example: 78,
  })
  @Column({ type: 'integer', nullable: true })
  humidity?: number;

  @Column({ type: 'text', nullable: true })
  last_sensor_err?: string;

  @ApiProperty({
    type: Boolean,
    description: 'Fan relay state at poll time',
    example: false,
  })
  @Column({ type: 'boolean', default: false })
  fan_on!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Humidifier relay state at poll time',
    example: true,
  })
  @Column({ type: 'boolean', default: false })
  humidifier_on!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Heater relay state at poll time',
    example: false,
  })
  @Column({ type: 'boolean', default: false })
  heater_on!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Whether the control loop was enabled at poll time',
    example: true,
  })
  @Column({ type: 'boolean', default: false })
  control_loop_enabled!: boolean;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Temperature setpoint active when the reading was taken',
    example: 22,
  })
  @Column({ type: 'integer', nullable: true })
  temperature_set?: number;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Humidity setpoint active when the reading was taken',
    example: 80,
  })
  @Column({ type: 'integer', nullable: true })
  humidity_set?: number;

  @ApiProperty({
    type: 'integer',
    description: 'Seconds since the Pico last booted',
    example: 3600,
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  board_uptime_s!: number;

  @ApiProperty({
    type: Number,
    description: 'MCU board temperature in °C',
    example: 31.4,
  })
  @Column({ type: 'float', nullable: false, default: 0 })
  board_temp!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Used memory in bytes',
    example: 112640,
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  board_used_mem!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Used filesystem space in bytes',
    example: 655360,
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  board_used_fs!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Round-trip poll response time in ms',
    example: 180,
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  time_to_response_ms!: number;

  // --- Relation to PicoUnit ---
  @Index()
  @ManyToOne(() => PicoUnit, (u) => u.readings ?? undefined, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pico_unit_id' })
  pico_unit!: PicoUnit;

  @Column({
    name: 'pico_unit_id',
    type: 'integer',
    nullable: false,
    update: false,
  })
  pico_unit_id!: number;
}
