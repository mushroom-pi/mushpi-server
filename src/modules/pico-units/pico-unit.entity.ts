import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

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
}
