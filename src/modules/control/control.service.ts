import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import axios, { AxiosResponse } from 'axios';

import {
  DevicesDto,
  OutputsDto,
  SetpointsDto,
} from 'src/common/dto/pico-unit-response.dto';
import {
  configureAxiosRetry,
  getWithFallback,
  postWithFallback,
} from 'src/common/utils/http-fallback';
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
import {
  findSetupPinConflict,
  formatPinConflict,
  hasSetupPinChanges,
} from './pin-collision.util';

@Injectable()
export class ControlService {
  constructor(
    private readonly readingsService: ReadingsService,
    private readonly picoUnitsService: PicoUnitsService,
  ) {
    configureAxiosRetry(axios);
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
    await this.assertNoPinCollision(picoUnit, setupDto);
    return this.callPollAndUpdate(
      picoUnit,
      '/setup',
      setupDto,
    ) as unknown as DevicesDto;
  }

  /**
   * Pre-flight for partial pin updates: the DTO can only see the pins present
   * in the request body, but the device may already hold the requested GPIO.
   * When the body changes at least one pin, fetch the live mapping fresh
   * (`GET /setup` — pin state is not persisted server-side), merge the partial
   * body over it, and reject a conflict with 422 BEFORE anything is forwarded.
   * Nothing reaches the device on rejection, so both functions cannot end up
   * on one GPIO. The original partial body is what gets forwarded on success —
   * the device applies only present keys; never fabricate a merged full
   * mapping. A body without pins (e.g. `active_high` only) skips the device
   * round trip entirely.
   */
  private async assertNoPinCollision(
    picoUnit: PicoUnit,
    setupDto: ChangeSetupDto,
  ): Promise<void> {
    if (!hasSetupPinChanges(setupDto.pins)) return;

    let res: AxiosResponse;
    try {
      res = await getWithFallback(picoUnit, '/setup', { timeout: 10000 });
    } catch (error) {
      // The device could not be consulted — mirror callSilent: a failed call
      // counts against the unit and surfaces through the axios filter as the
      // same 417/502/424 class a failed forward POST would produce.
      await this.picoUnitsService.addFailedCall(picoUnit);
      throw error;
    }

    // Parse leniently: untrusted device response, unknown values are excluded
    // from the merge (findSetupPinConflict is total).
    const conflict = findSetupPinConflict(res.data?.pins, setupDto.pins);
    if (conflict) {
      // A validation rejection is not a device fault — no failed_calls.
      throw new UnprocessableEntityException(formatPinConflict(conflict));
    }
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
    if (!latest?.control_loop_enabled) {
      return false;
    }

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
