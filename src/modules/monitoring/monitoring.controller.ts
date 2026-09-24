import { Controller, Get, Query, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

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
    schema: { example: 'pong' },
    type: String,
  })
  ping(): string {
    return this.monitoringService.ping();
  }

  @Get('health')
  // Docker HEALTHCHECK target: must stay reachable and header-free regardless
  // of how much traffic the rest of the API is taking (the throttler emits its
  // X-RateLimit-* headers from inside the guard, so skipping is what removes
  // them — see REFERENCE.md §Guards).
  @SkipThrottle()
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
