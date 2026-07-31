import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardV1Controller {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  @ApiTags('no-validation')
  @ApiOperation({
    summary: 'Get dashboard summary',
    description:
      'Aggregated snapshot: unit health, active/approaching/recently-finished batches, top recipes, global counts, and current warnings.',
  })
  @ApiOkResponse({
    description: 'Dashboard summary',
    type: DashboardSummaryDto,
  })
  async getSummary(): Promise<DashboardSummaryDto> {
    return this.svc.getSummary();
  }
}
