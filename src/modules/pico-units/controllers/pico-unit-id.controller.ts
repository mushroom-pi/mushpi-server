import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { ApiAxiosErrorResponses } from 'src/common/decorators/docs/axios-errors.decorator';
import { ApiEmptyOkResponse } from 'src/common/decorators/docs/empty-ok-response.decorator';
import { OnlyEnabledPicoUnits } from 'src/common/decorators/docs/only-enabled-pico-unit.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';
import { ReadingsService } from 'src/modules/readings/readings.service';

import {
  RebootDto,
  RebootResponseDto,
  UpdatePicoUnitDto,
} from '../pico-unit.dto';
import { PicoUnit } from '../pico-unit.entity';
import { PicoUnitsService } from '../pico-units.service';

@ApiTags('pico-units')
@Controller('pico-units/:picoUnitId')
@ApiPicoUnit()
export class PicoUnitIdController {
  constructor(
    private readonly svc: PicoUnitsService,
    private readonly readingsService: ReadingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get a Pico Unit by id' })
  @ApiOkResponse({ type: PicoUnit })
  getOne(@GetPicoUnit() unit: PicoUnit) {
    return unit;
  }

  @Patch()
  @ApiOperation({ summary: 'Update a Pico Unit' })
  @ApiOkResponse({ type: PicoUnit })
  @ApiConflictResponse({ description: 'host:port already exists' })
  update(@GetPicoUnit() unit: PicoUnit, @Body() dto: UpdatePicoUnitDto) {
    return this.svc.update(unit, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a Pico Unit' })
  @ApiEmptyOkResponse({ description: 'Deleted' })
  remove(@Param('picoUnitId') id: string) {
    return this.svc.removeById(Number(id));
  }

  @ApiTags('proxy')
  @Get('ping')
  @ApiOperation({
    summary: 'Ping the Pico Unit',
    description:
      "Send GET request to the unit's most basic life-check endpoint",
  })
  @ApiOkResponse({ example: 'pong' })
  @ApiAxiosErrorResponses()
  ping(@GetPicoUnit() unit: PicoUnit) {
    return this.svc.ping(unit);
  }

  @ApiTags('proxy')
  @OnlyEnabledPicoUnits()
  @Post('poll')
  @ApiOperation({
    summary:
      'Trigger an on-demand poll of the Pico unit and return updated unit data',
  })
  @ApiOkResponse({
    type: PicoUnit,
    description: 'Unit after a fresh reading was stored',
  })
  @ApiAxiosErrorResponses()
  @ApiResponse({
    status: 423,
    type: ErrorDto,
    description: 'This Pico unit is already being polled',
  })
  async poll(@GetPicoUnit() unit: PicoUnit) {
    await this.readingsService.pollReadingsFromUnit(unit);
    return this.readingsService.getPicoUnitWithLatestReadingById(unit.id);
  }

  @ApiTags('proxy')
  @OnlyEnabledPicoUnits()
  @Put('reboot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reboot the Pico Unit',
    description:
      'Proxies a reboot command to the Pico Unit. `soft` performs machine.soft_reset() (preserves cumulative uptime); `hard` performs machine.reset() (full power-cycle, uptime resets). Responds 202 Accepted because the unit becomes unreachable while rebooting.',
  })
  @ApiAcceptedResponse({
    description: 'Reboot command accepted',
    type: RebootResponseDto,
  })
  @ApiAxiosErrorResponses()
  reboot(@GetPicoUnit() unit: PicoUnit, @Body() body: RebootDto) {
    return this.svc.reboot(unit, body);
  }
}
