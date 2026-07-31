import { ApiProperty } from '@nestjs/swagger';

export class SettingsResponseDto {
  @ApiProperty({
    example: 'Europe/Madrid',
    description: 'IANA timezone name for display',
  })
  timezone!: string;
}
