import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsOptional, IsString } from 'class-validator';

import { IsValidTimezone } from 'src/common/validators/is-valid-timezone.validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'Europe/Madrid' })
  @IsOptional()
  @IsString()
  @IsValidTimezone()
  timezone?: string;
}
