import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import { ILike, MoreThan, Repository } from 'typeorm';

import { PORT_DEFAULT } from 'src/common/constants/hardware.constants';
import { FailedDependencyException } from 'src/common/exceptions/failed-dependency.exception';
import {
  configureAxiosRetry,
  getWithFallback,
  postWithFallback,
} from 'src/common/utils/http-fallback';

import {
  AnnouncePicoUnitDto,
  CreatePicoUnitDto,
  ListPicoUnitsQueryDto,
  RebootDto,
  RebootResponseDto,
  UpdatePicoUnitDto,
} from './pico-unit.dto';
import { PicoUnit } from './pico-unit.entity';
import {
  PICO_UNIT_EVENTS,
  PicoUnitCreatedEvent,
  PicoUnitDisabledEvent,
  PicoUnitEnabledEvent,
  PicoUnitRegisteredEvent,
} from './pico-unit.events';
import { failsToUnhealthy } from './pico-units.constant';

@Injectable()
export class PicoUnitsService {
  constructor(
    @InjectRepository(PicoUnit) private picoUnitRepo: Repository<PicoUnit>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    configureAxiosRetry(axios);
  }

  async announce(dto: AnnouncePicoUnitDto): Promise<PicoUnit> {
    const {
      port,
      handle,
      ip,
      micropython_version,
      software_version,
      board,
      board_cpu_freq_mhz,
      board_total_fs_byte,
      board_total_mem_byte,
      mac,
    } = dto;
    let unit: Partial<PicoUnit> = await this.picoUnitRepo.findOne({
      where: { handle },
    });

    if (!unit) {
      unit = {
        handle,
        ip: ip ?? null,
        port,
        micropython_version: micropython_version ?? null,
        software_version: software_version ?? null,
        board: board ?? null,
        board_cpu_freq_mhz: board_cpu_freq_mhz ?? 0,
        board_total_fs_byte: board_total_fs_byte ?? 0,
        board_total_mem_byte: board_total_mem_byte ?? 0,
        mac: mac ?? null,
      };
    } else if (!ip) {
      throw new ConflictException(
        `PicoUnit with handle ${handle} already exists with IP ${unit.ip}. Cannot update IP on existing unit.`,
      );
    } else {
      Object.assign(unit, dto);
    }

    unit.last_seen = new Date();
    await this.picoUnitRepo.save(unit);
    const saved = await this.picoUnitRepo.findOneBy({ handle });
    this.eventEmitter.emit(
      PICO_UNIT_EVENTS.REGISTERED,
      new PicoUnitRegisteredEvent(saved!),
    );
    return saved!;
  }

  async create(dto: CreatePicoUnitDto): Promise<PicoUnit> {
    const existing = await this.picoUnitRepo.findOne({
      where: { handle: dto.handle },
    });
    if (existing) {
      throw new ConflictException(
        `PicoUnit with handle ${dto.handle} already exists`,
      );
    }

    const unit = this.picoUnitRepo.create({
      handle: dto.handle,
      port: PORT_DEFAULT,
    });

    try {
      await getWithFallback(unit, '/ping', { timeout: 5000 });
    } catch {
      throw FailedDependencyException({
        description: `Pico unit ${dto.handle} is not reachable at http://${dto.handle}.local:${PORT_DEFAULT}/ping`,
      });
    }

    const saved = await this.picoUnitRepo.save(unit);
    this.eventEmitter.emit(
      PICO_UNIT_EVENTS.CREATED,
      new PicoUnitCreatedEvent(saved),
    );
    return saved;
  }

  async getByIdOrThrow(
    id: number,
    onlyEnabled: boolean = false,
  ): Promise<PicoUnit> {
    const unit = await this.picoUnitRepo.findOne({ where: { id } });
    if (!unit || (onlyEnabled && !unit.enabled)) {
      throw new NotFoundException(`PicoUnit ${id} not found`);
    }

    return unit;
  }

  async list(query: ListPicoUnitsQueryDto) {
    const { page = 1, limit = 20, enabled, q } = query;

    const where: any[] = [];
    const base: any = {};
    if (typeof enabled === 'boolean') base.enabled = enabled;

    if (q && q.trim()) {
      const like = ILike(`%${q.trim()}%`);
      // OR across fields
      where.push({ ...base, handle: like });
      where.push({ ...base, name: like });
      where.push({ ...base, ip: like });
    } else {
      where.push(base);
    }

    const [items, total] = await this.picoUnitRepo.findAndCount({
      where,
      order: { id: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async listEnabled(): Promise<PicoUnit[]> {
    return this.picoUnitRepo.find({
      where: { enabled: true },
    });
  }

  async listUnhealthy(): Promise<PicoUnit[]> {
    return this.picoUnitRepo.find({
      where: { enabled: true, failed_calls: MoreThan(failsToUnhealthy) },
      order: { last_seen: 'DESC' },
    });
  }

  async update(unit: PicoUnit, dto: UpdatePicoUnitDto): Promise<PicoUnit> {
    const wasEnabled = unit.enabled;
    Object.assign(unit, dto);
    const saved = await this.picoUnitRepo.save(unit);

    if (wasEnabled && !saved.enabled) {
      this.eventEmitter.emit(
        PICO_UNIT_EVENTS.DISABLED,
        new PicoUnitDisabledEvent(saved),
      );
    } else if (!wasEnabled && saved.enabled) {
      this.eventEmitter.emit(
        PICO_UNIT_EVENTS.ENABLED,
        new PicoUnitEnabledEvent(saved),
      );
    }

    return saved;
  }

  async removeById(id: number): Promise<void> {
    await this.picoUnitRepo.delete(id);
    return;
  }

  async touch(unit: PicoUnit): Promise<PicoUnit> {
    unit.last_seen = new Date();
    return this.picoUnitRepo.save(unit);
  }

  async ping(unit: PicoUnit): Promise<string> {
    try {
      await getWithFallback(unit, '/ping', { timeout: 5000 });
      await this.touch(unit);
      return 'pong';
    } catch (error) {
      await this.addFailedCall(unit);
      throw error;
    }
  }

  async reboot(unit: PicoUnit, dto: RebootDto): Promise<RebootResponseDto> {
    try {
      await postWithFallback(unit, '/reboot', dto, { timeout: 5000 });
    } catch (error) {
      // Pico reboots and drops the connection mid-response: if a request was
      // dispatched, treat it as success (the reboot command was sent).
      if (axios.isAxiosError(error) && !(error as any).response) {
        // network drop / timeout after the request left — expected
      } else {
        await this.addFailedCall(unit);
        throw error;
      }
    }
    return { message: 'Reboot initiated', type: dto.type };
  }

  async addFailedCall(unit: PicoUnit): Promise<PicoUnit> {
    unit.failed_calls++;
    return this.picoUnitRepo.save(unit);
  }

  async addFailedReading(unit: PicoUnit): Promise<PicoUnit> {
    unit.failed_readings++;
    return this.picoUnitRepo.save(unit);
  }

  async resetFailedReadings(unit: PicoUnit): Promise<PicoUnit> {
    unit.failed_readings = 0;
    return this.picoUnitRepo.save(unit);
  }

  async addEmptyReading(unit: PicoUnit): Promise<PicoUnit> {
    unit.consecutive_empty_readings =
      (unit.consecutive_empty_readings ?? 0) + 1;
    return this.picoUnitRepo.save(unit);
  }

  async resetEmptyReadings(unit: PicoUnit): Promise<PicoUnit> {
    unit.consecutive_empty_readings = 0;
    return this.picoUnitRepo.save(unit);
  }

  async touchAndResetFailedCalls(
    unit: PicoUnit,
    mac?: string,
  ): Promise<PicoUnit> {
    unit.last_seen = new Date();
    unit.failed_calls = 0;
    if (mac && !unit.mac) unit.mac = mac;
    return this.picoUnitRepo.save(unit);
  }
}
