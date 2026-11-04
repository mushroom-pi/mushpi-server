import { Controller, Get, Query, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import {
  RATE_LIMIT_ABUSE_THROTTLER_NAME,
  RATE_LIMIT_GLOBAL_THROTTLER_NAME,
} from 'src/common/constants/rate-limit.constants';

import { HealthCheckQueryDto, HealthCheckResponseDto } from './monitoring.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@ApiBearerAuth('secret')
@Controller({ version: VERSION_NEUTRAL })
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @ApiTags('no-validation')
  @Get('ping')
  @ApiOperation({ summary: 'The simplest server status check' })
  @ApiOkResponse({
    description: 'Server is up and running',
    // Media-type-scoped schema (OAS3); a response-level `schema` is Swagger 2.0
    // and makes the generated spec fail validation.
    content: {
      'application/json': {
        schema: { type: 'string', example: 'pong' },
      },
    },
  })
  ping(): string {
    return this.monitoringService.ping();
  }

  @Get('health')
  // Docker HEALTHCHECK target: must stay reachable and header-free regardless
  // of how much traffic the rest of the API is taking (the throttler emits its
  // X-RateLimit-* headers from inside the guard, so skipping is what removes
  // them — see REFERENCE.md §Guards). Skips ALL THREE demo definitions by
  // name: the named skip keys are inert on non-demo boots (those throttler
  // names only exist on a demo boot), and `default: true` preserves the
  // historical exemption of the opt-in limiter.
  @SkipThrottle({
    default: true,
    [RATE_LIMIT_GLOBAL_THROTTLER_NAME]: true,
    [RATE_LIMIT_ABUSE_THROTTLER_NAME]: true,
  })
  @ApiOperation({
    summary:
      'Check server and dependencies status. All the information will be returned if no query is included. Use query parameters to filter the checks that you want implemented',
  })
  @ApiOkResponse({
    description: 'Status of the server and any requested dependencies',
    type: HealthCheckResponseDto,
  })
  health(@Query() query: HealthCheckQueryDto) {
    return this.monitoringService.health(query);
  }
}
