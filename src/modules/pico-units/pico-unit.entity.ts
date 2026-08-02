import { ApiProperty } from '@nestjs/swagger';

import { Expose, Transform } from 'class-transformer';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Readings } from '../readings/readings.entity';
import { PICO_UNIT_STATUSES, PicoUnitStatus } from './pico-unit.type';
import { OFFLINE_FAILED_CALLS_THRESHOLD } from './pico-units.constant';

@Entity('pico_unit')
export class PicoUnit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'text', nullable: false, unique: true })
  handle!: string;

  @Column({ type: 'text', nullable: true })
  name?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  face_color?: string | null;

  @Expose()
  @Transform(({ obj }) => `${obj.handle}.local`)
  @ApiProperty({
    description: 'mDNS hostname derived from handle',
    example: 'unit-01.local',
  })
  get host(): string {
    return `${this.handle}.local`;
  }

  @Column({ type: 'text', nullable: true })
  ip?: string;

  @Column({ type: 'text', nullable: true })
  mac?: string;

  @Column({ type: 'integer', default: 5000 })
  port!: number;

  @Column({ type: 'boolean', default: true, name: 'enabled' }) // Column 'enabled' kept for backward compat; property renamed for clarity.
  monitored!: boolean;

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

  @ApiProperty({
    description: 'Consecutive unreachable polls from the server cron',
    example: 0,
    type: 'integer',
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  failed_calls!: number;

  @ApiProperty({
    description:
      'Consecutive out-of-range DHT11 readings (0-50°C, 10-90% humidity). Resets to 0 on a valid reading.',
    example: 0,
    type: 'integer',
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  failed_readings!: number;

  @ApiProperty({
    description:
      'Consecutive polls where both temp and humidity were null (sensor returned no data). Resets to 0 when at least one value is non-null.',
    example: 0,
    type: 'integer',
  })
  @Column({ type: 'integer', nullable: false, default: 0 })
  consecutive_empty_readings!: number;

  @Expose()
  @Transform(({ obj }) => `http://${obj.handle}.local:${obj.port}`)
  @ApiProperty({
    description: "Local mDNS address for the pico unit's REST API",
    example: 'http://unit-01.local:5000',
  })
  get address(): string {
    return `http://${this.host}:${this.port}`;
  }

  @Expose()
  @Transform(({ obj }) => (obj.ip ? `http://${obj.ip}:${obj.port}` : undefined))
  @ApiProperty({
    description: 'IP-based address for the pico unit (fallback)',
    example: 'http://192.168.1.50:5000',
    nullable: true,
  })
  get ipAddress(): string | undefined {
    return this.ip ? `http://${this.ip}:${this.port}` : undefined;
  }

  @Expose()
  @ApiProperty({
    enum: PICO_UNIT_STATUSES,
    description:
      'Computed health status: unmonitored (not being polled), healthy (reachable, no faults), degraded (sensor issues), offline (unreachable for >= 3 polls)',
  })
  get status(): PicoUnitStatus {
    if (!this.monitored) return 'unmonitored';
    if ((this.failed_calls ?? 0) >= OFFLINE_FAILED_CALLS_THRESHOLD)
      return 'offline';
    if (
      (this.failed_readings ?? 0) > 0 ||
      (this.consecutive_empty_readings ?? 0) > 0
    )
      return 'degraded';
    return 'healthy';
  }

  @OneToMany(() => Readings, (r) => r.pico_unit)
  readings?: Readings[];

  @ApiProperty({
    type: Readings,
    nullable: true,
    description: 'Latest reading row for this unit (computed, not stored)',
  })
  latest_reading?: Readings;
}
