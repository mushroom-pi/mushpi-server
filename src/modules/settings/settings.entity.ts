import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('settings')
export class Settings {
  @ApiProperty({ example: 1, description: 'Always 1 (single settings row)' })
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  @ApiProperty({
    example: 'Europe/Madrid',
    description: 'IANA timezone name for display',
  })
  @Column({ type: 'text', nullable: false })
  @IsString()
  timezone!: string;
}
