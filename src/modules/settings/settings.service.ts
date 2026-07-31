import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { SettingsResponseDto } from './dto/settings-response.dto';
import { OS_TIMEZONE, SETTINGS_SINGLE_ROW_ID } from './settings.constant';
import { Settings } from './settings.entity';

@Injectable()
export class SettingsService {
  private cachedTimezone: string | null = null;

  constructor(
    @InjectRepository(Settings)
    private readonly repo: Repository<Settings>,
  ) {}

  async getTimezone(): Promise<string> {
    if (this.cachedTimezone !== null) {
      return this.cachedTimezone;
    }

    const row = await this.repo.findOneBy({ id: SETTINGS_SINGLE_ROW_ID });
    const tz = row?.timezone ?? OS_TIMEZONE;
    this.cachedTimezone = tz;
    return tz;
  }

  async setTimezone(tz: string): Promise<SettingsResponseDto> {
    await this.repo.save({ id: SETTINGS_SINGLE_ROW_ID, timezone: tz });
    this.cachedTimezone = tz;
    return { timezone: tz };
  }

  async getSettings(): Promise<SettingsResponseDto> {
    const timezone = await this.getTimezone();
    return { timezone };
  }

  /** Reset the in-memory cache (for test hygiene). */
  resetCache(): void {
    this.cachedTimezone = null;
  }
}
