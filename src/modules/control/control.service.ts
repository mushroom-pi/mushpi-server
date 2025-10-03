import { ConflictException, Injectable } from '@nestjs/common';

import axios from 'axios';
import axiosRetry from 'axios-retry';

import {
  DevicesDto,
  OutputsDto,
  SetpointsDto,
} from 'src/common/dto/pico-unit-response.dto';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { ReadingsService } from 'src/modules/readings/readings.service';

import {
  ChangeOutputsDto,
  ChangeSetPointsDto,
  ChangeSetupDto,
  ControlLoopDto,
} from './control.dto';

@Injectable()
export class ControlService {
  constructor(private readonly readingsService: ReadingsService) {
    axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay });
  }

  async setpoints(
    picoUnit: PicoUnit,
    setpointsDto: ChangeSetPointsDto,
  ): Promise<SetpointsDto> {
    const res = await axios.post(`${picoUnit.address}/setpoints`, setpointsDto);
    await this.readingsService.pollReadingsFromUnit(picoUnit);

    return res.data as SetpointsDto;
  }

  async setup(
    picoUnit: PicoUnit,
    setupDto: ChangeSetupDto,
  ): Promise<DevicesDto> {
    const res = await axios.post(`${picoUnit.address}/setup`, setupDto);
    await this.readingsService.pollReadingsFromUnit(picoUnit);

    return res.data as DevicesDto;
  }

  async outputs(
    picoUnit: PicoUnit,
    outputsDto: ChangeOutputsDto,
  ): Promise<OutputsDto> {
    const latestForUnit = await this.readingsService.latestForUnit(picoUnit.id);
    if (latestForUnit?.control_loop_enabled)
      throw new ConflictException(
        'This endpoint cannot be used while the control loop is enabled',
      );

    const res = await axios.post(`${picoUnit.address}/outputs`, outputsDto);
    await this.readingsService.pollReadingsFromUnit(picoUnit);

    return res.data as OutputsDto;
  }

  async loop(
    picoUnit: PicoUnit,
    controlLoopDto: ControlLoopDto,
  ): Promise<ControlLoopDto> {
    const res = await axios.post(`${picoUnit.address}/control`, controlLoopDto);
    await this.readingsService.pollReadingsFromUnit(picoUnit);

    return res.data as ControlLoopDto;
  }
}
