import { INestApplication, VersioningType } from '@nestjs/common';

const API_VERSION = '1' as const;

export function applyApiVersioning(app: INestApplication): void {
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
}
