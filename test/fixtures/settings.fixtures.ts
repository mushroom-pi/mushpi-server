import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Settings } from 'src/modules/settings/settings.entity';
import { SettingsService } from 'src/modules/settings/settings.service';

export async function clearSettings(app: INestApplication): Promise<void> {
  const repo = app.get(getRepositoryToken(Settings));
  await repo.clear();
  const svc = app.get(SettingsService);
  svc.resetCache();
}
