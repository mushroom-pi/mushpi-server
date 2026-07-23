import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotAcceptableResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiFailedDependencyResponse } from 'src/common/decorators/docs/api-failed-dependency-response.decorator';
import { PicoAnnounceSecret } from 'src/common/decorators/docs/pico-announce-secret.decorator';
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
