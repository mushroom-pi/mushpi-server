import { Injectable } from '@nestjs/common';

import axios from 'axios';
import axiosRetry from 'axios-retry';

import {
  DevicesDto,
  OutputsDto,
  SetpointsDto,
} from 'src/common/dto/pico-unit-response.dto';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';
import { ReadingsService } from 'src/modules/readings/readings.service';

import {
  ChangeOutputsDto,
  ChangeSetPointsDto,
  ChangeSetupDto,
  ControlLoopDto,
} from './control.dto';

@Injectable()
export class ControlService {
  constructor(
    private readonly readingsService: ReadingsService,
    private readonly picoUnitsService: PicoUnitsService,
  ) {
    axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay });
  }

  private async callPollAndUpdate(picoUnit: PicoUnit, url: string, dto: any) {
    try {
      const res = await axios.post(url, dto);
      await this.readingsService.pollReadingsFromUnit(picoUnit);

      return res.data;
    } catch (error) {
      await this.picoUnitsService.addFailedCall(picoUnit);
      throw error;
    }
  }

  async setpoints(
    picoUnit: PicoUnit,
    setpointsDto: ChangeSetPointsDto,
  ): Promise<SetpointsDto> {
    return this.callPollAndUpdate(
      picoUnit,
      `${picoUnit.address}/setpoints`,
      setpointsDto,
    ) as unknown as SetpointsDto;
  }

  async setup(
    picoUnit: PicoUnit,
    setupDto: ChangeSetupDto,
  ): Promise<DevicesDto> {
    return this.callPollAndUpdate(
      picoUnit,
      `${picoUnit.address}/setup`,
      setupDto,
    ) as unknown as DevicesDto;
  }

  async outputs(
    picoUnit: PicoUnit,
    outputsDto: ChangeOutputsDto,
  ): Promise<OutputsDto> {
    return this.callPollAndUpdate(
      picoUnit,
      `${picoUnit.address}/outputs`,
      outputsDto,
    ) as unknown as OutputsDto;
  }

  async loop(
    picoUnit: PicoUnit,
    controlLoopDto: ControlLoopDto,
  ): Promise<ControlLoopDto> {
    return this.callPollAndUpdate(
      picoUnit,
      `${picoUnit.address}/control`,
      controlLoopDto,
    ) as unknown as ControlLoopDto;
  }
}
