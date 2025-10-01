import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('health')
export class Health {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: string;
}
