import { Body, Controller, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { ApiAxiosErrorResponses } from 'src/common/decorators/docs/axios-errors.decorator';
import { OnlyMonitoredPicoUnitsWithControlLoop } from 'src/common/decorators/docs/only-monitored-pico-unit-with-control-loop.decorator';
import { OnlyMonitoredPicoUnits } from 'src/common/decorators/docs/only-monitored-pico-unit.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import {
  DevicesDto,
  OutputsDto,
  SetpointsDto,
} from 'src/common/dto/pico-unit-response.dto';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import {
  ChangeOutputsDto,
  ChangeSetPointsDto,
  ChangeSetupDto,
  ControlLoopDto,
} from './control.dto';
import { ControlService } from './control.service';

@ApiTags('proxy', 'control')
@Controller('pico-units/:picoUnitId/control')
@ApiPicoUnit()
@ApiAxiosErrorResponses()
export class PicoUnitIdControlV1Controller {
  constructor(private readonly svc: ControlService) {}

  @Put('setpoints')
  @OnlyMonitoredPicoUnits()
  @ApiOperation({
    summary: 'Change temperature and/or humidity targets',
    description:
      'Modify the temperature and/or humidity targets for a Pico Unit. If the control loop is enabled, these changes will affect the devices. If success, a new reading will be generated afterwards.',
  })
  @ApiOkResponse({ type: SetpointsDto })
  setpoints(@GetPicoUnit() unit: PicoUnit, @Body() body: ChangeSetPointsDto) {
    return this.svc.setpoints(unit, body);
  }

  @Put('setup')
  @OnlyMonitoredPicoUnits()
  @ApiOperation({
    summary: 'Change connections setup',
    description:
      'Use this endpoint to modify any of the PIN connections in the Pico Unit. Using it will make the Unit change its PIN-devices mapping. Use this endpoint with care.',
  })
  @ApiOkResponse({ type: DevicesDto })
  setup(@GetPicoUnit() unit: PicoUnit, @Body() body: ChangeSetupDto) {
    return this.svc.setup(unit, body);
  }

  @Put('outputs')
  @OnlyMonitoredPicoUnitsWithControlLoop()
  @ApiOperation({
    summary: 'Turn devices on and/or off',
    description:
      "Change the status of the Pico Unit's devices. This endpoint will only have an effect if the control loop is deactivated.",
  })
  @ApiOkResponse({ type: OutputsDto })
  outputs(@GetPicoUnit() unit: PicoUnit, @Body() body: ChangeOutputsDto) {
    return this.svc.outputs(unit, body);
  }

  @Put('loop')
  @OnlyMonitoredPicoUnits()
  @ApiOperation({
    summary: 'Turn control loop on or off',
    description:
      "Turns the Pico Unit's control loop (the logic that keeps track of the targets and turns devices on and off automatically to meet them) on and off. This action will override any manual settings that the outputs might be using and will use the temperature and humidity set points.",
  })
  @ApiOkResponse({ type: ControlLoopDto })
  loop(@GetPicoUnit() unit: PicoUnit, @Body() body: ControlLoopDto) {
    return this.svc.loop(unit, body);
  }
}
