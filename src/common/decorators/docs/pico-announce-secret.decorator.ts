import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';
import { PicoAnnounceSecretGuard } from 'src/common/guards/pico-announce-secret.guard';

export function PicoAnnounceSecret() {
  return applyDecorators(
    UseGuards(PicoAnnounceSecretGuard),
    ApiHeader({
      name: 'X-Pico-Secret',
      required: true,
      description: 'Shared secret for Pico hardware announcements',
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid X-Pico-Secret header',
      type: ErrorDto,
    }),
  );
}
