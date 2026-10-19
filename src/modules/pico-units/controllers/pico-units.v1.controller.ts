import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotAcceptableResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import {
  RATE_LIMIT_ABUSE_THROTTLER_NAME,
  RATE_LIMIT_GLOBAL_THROTTLER_NAME,
} from 'src/common/constants/rate-limit.constants';
import { ApiFailedDependencyResponse } from 'src/common/decorators/docs/api-failed-dependency-response.decorator';
import { PicoAnnounceSecret } from 'src/common/decorators/docs/pico-announce-secret.decorator';
import { ReadOnlyExempt } from 'src/common/decorators/docs/readonly-exempt.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';

import {
  AnnouncePicoUnitDto,
  CreatePicoUnitDto,
  ListPicoUnitsQueryDto,
  PicoUnitListResponseDto,
} from '../pico-unit.dto';
import { PicoUnit } from '../pico-unit.entity';
import { PicoUnitsService } from '../pico-units.service';

@ApiTags('pico-units')
@Controller('pico-units')
@ApiNotAcceptableResponse({
  description: 'Database-related error',
  type: ErrorDto,
})
export class PicoUnitsV1Controller {
  constructor(private readonly svc: PicoUnitsService) {}

  @Post()
  @ApiOperation({
    summary: 'Manually add a Pico Unit',
    description:
      'Register a Pico unit by handle after verifying it is reachable via mDNS.',
  })
  @ApiCreatedResponse({
    description: 'Pico unit created',
    type: PicoUnit,
  })
  @ApiConflictResponse({
    description: 'A Pico unit with the same handle already exists',
    type: ErrorDto,
  })
  @ApiFailedDependencyResponse({
    description: 'Pico unit not reachable via mDNS',
  })
  create(@Body() dto: CreatePicoUnitDto) {
    return this.svc.create(dto);
  }

  @Post('announce')
  @PicoAnnounceSecret()
  // The complete exemption set for the demo read-only guard: announcement is
  // the only inbound writer left open on a demo boot (PicoAnnounceSecretGuard
  // still enforces X-Pico-Secret — 401 without it).
  @ReadOnlyExempt()
  // Simulated units' announcements must be accepted throughout a whole-demo
  // flood (criterion 7): skip the backstop and the abuse limiter BY NAME.
  // Both skips are inert outside demo, where those throttler names never
  // exist, so a self-hosted hub's opt-in `default` limiter keeps counting
  // announcements (pinned by test/rate-limit-headers.e2e-spec.ts). The
  // visitor pace (unnamed `default` throttler) still applies here —
  // announce is the one inbound writer a flood must not use as a bypass.
  @SkipThrottle({
    [RATE_LIMIT_GLOBAL_THROTTLER_NAME]: true,
    [RATE_LIMIT_ABUSE_THROTTLER_NAME]: true,
  })
  @ApiOperation({
    summary: 'Announce a Pico Unit (hardware)',
    description:
      'Called by Pico units on boot with hardware/network metadata. Upserts by handle.',
  })
  @ApiCreatedResponse({
    description: 'Pico unit registered/updated',
    type: PicoUnit,
  })
  @ApiConflictResponse({
    description: 'Existing unit cannot be updated without an IP',
    type: ErrorDto,
  })
  announce(@Body() dto: AnnouncePicoUnitDto) {
    return this.svc.announce(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List Pico Units (paginated)',
    description:
      'Retrieve all the pico units stored in the database, with minimal filtering options',
  })
  @ApiOkResponse({
    description: 'List with pagination',
    type: PicoUnitListResponseDto,
  })
  list(@Query() query: ListPicoUnitsQueryDto) {
    return this.svc.list(query);
  }
}
