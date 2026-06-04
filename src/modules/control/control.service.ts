import { Injectable } from '@nestjs/common';

import axios from 'axios';
import axiosRetry from 'axios-retry';

import {
  DevicesDto,
  OutputsDto,
  SetpointsDto,
} from 'src/common/dto/pico-unit-response.dto';
import { postWithFallback } from 'src/common/utils/http-fallback';
import { Batch } from 'src/modules/batches/batches.entity';
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

  private async callSilent(
    picoUnit: PicoUnit,
    path: string,
    dto: unknown,
  ): Promise<void> {
    try {
      await postWithFallback(picoUnit, path, dto);
    } catch (error) {
      await this.picoUnitsService.addFailedCall(picoUnit);
      throw error;
    }
  }

  private async callPollAndUpdate(
    picoUnit: PicoUnit,
    path: string,
    dto: unknown,
  ) {
    try {
      const res = await postWithFallback(picoUnit, path, dto);
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
      '/setpoints',
      setpointsDto,
    ) as unknown as SetpointsDto;
  }

  async setup(
    picoUnit: PicoUnit,
    setupDto: ChangeSetupDto,
  ): Promise<DevicesDto> {
    return this.callPollAndUpdate(
      picoUnit,
      '/setup',
      setupDto,
    ) as unknown as DevicesDto;
  }

  async outputs(
    picoUnit: PicoUnit,
    outputsDto: ChangeOutputsDto,
  ): Promise<OutputsDto> {
    return this.callPollAndUpdate(
      picoUnit,
      '/outputs',
      outputsDto,
    ) as unknown as OutputsDto;
  }

  async loop(
    picoUnit: PicoUnit,
    controlLoopDto: ControlLoopDto,
  ): Promise<ControlLoopDto> {
    return this.callPollAndUpdate(
      picoUnit,
      '/control',
      controlLoopDto,
    ) as unknown as ControlLoopDto;
  }

  async applyBatchSettings(picoUnit: PicoUnit, batch: Batch): Promise<boolean> {
    const latest = await this.readingsService.latestForUnit(picoUnit.id);

    const tempDiffers =
      batch.temperature_target != null &&
      latest?.temperature_set !== batch.temperature_target;
    const humidDiffers =
      batch.humidity_target != null &&
      latest?.humidity_set !== batch.humidity_target;
    const loopNeedsEnable = !latest?.control_loop_enabled;

    if (!tempDiffers && !humidDiffers && !loopNeedsEnable) return false;

    if (tempDiffers || humidDiffers) {
      const setpoints: Pick<ChangeSetPointsDto, 'temperature' | 'humidity'> =
        {};
      if (batch.temperature_target != null)
        setpoints.temperature = batch.temperature_target;
      if (batch.humidity_target != null)
        setpoints.humidity = batch.humidity_target;
      await this.callSilent(picoUnit, '/setpoints', setpoints);
    }

    if (loopNeedsEnable) {
      await this.callSilent(picoUnit, '/control', {
        enabled: true,
      });
    }

    return true;
  }

  async applyControlLoopDisable(picoUnit: PicoUnit): Promise<boolean> {
    const latest = await this.readingsService.latestForUnit(picoUnit.id);
    if (!latest?.control_loop_enabled) return false;

    await this.callSilent(picoUnit, '/control', {
      enabled: false,
    });
    return true;
  }

  async applyUnitDisabled(picoUnit: PicoUnit): Promise<boolean> {
    const latest = await this.readingsService.latestForUnit(picoUnit.id);
    const controlEnabled = latest?.control_loop_enabled ?? false;
    const anyOutputOn =
      (latest?.fan_on ?? false) ||
      (latest?.humidifier_on ?? false) ||
      (latest?.heater_on ?? false);

    if (!controlEnabled && !anyOutputOn) return false;

    if (controlEnabled) {
      await this.callSilent(picoUnit, '/control', {
        enabled: false,
      });
    }

    if (anyOutputOn) {
      await this.callSilent(picoUnit, '/outputs', {
        fan: false,
        humidifier: false,
        heater: false,
      });
    }

    return true;
  }
}
