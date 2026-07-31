import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SettingsResponseDto } from './dto/settings-response.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsV1Controller {
  constructor(private readonly svc: SettingsService) {}

  @Get()
  @ApiTags('no-validation')
  @ApiOperation({
    summary: 'Get settings',
    description:
      'Returns the current settings. The timezone defaults to the OS timezone when no row exists.',
  })
  @ApiOkResponse({
    description: 'Current settings',
    type: SettingsResponseDto,
  })
  async getSettings(): Promise<SettingsResponseDto> {
    return this.svc.getSettings();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update settings',
    description:
      'Partial update of settings. Only provided fields are changed.',
  })
  @ApiOkResponse({
    description: 'Updated settings',
    type: SettingsResponseDto,
  })
  async updateSettings(
    @Body() dto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    if (dto.timezone !== undefined) {
      return this.svc.setTimezone(dto.timezone);
    }
    return this.svc.getSettings();
  }
}
