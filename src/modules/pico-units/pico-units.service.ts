import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { ILike, Repository } from 'typeorm';

import {
  ListPicoUnitsQueryDto,
  UpdatePicoUnitDto,
  UpsertPicoUnitDto,
} from './pico-unit.dto';
import { PicoUnit } from './pico-unit.entity';

@Injectable()
export class PicoUnitsService {
  constructor(
    @InjectRepository(PicoUnit) private picoUnitRepo: Repository<PicoUnit>,
  ) {
    axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay });
  }

  async upsert(unitDto: UpsertPicoUnitDto): Promise<PicoUnit> {
    const {
      host,
      port,
      handle,
      micropython_version,
      software_version,
      board,
      board_cpu_freq_mhz,
      board_total_fs_byte,
      board_total_mem_byte,
    } = unitDto;
    let unit: Partial<PicoUnit> = await this.picoUnitRepo.findOne({
      where: { host, port },
    });

    if (!unit) {
      unit = {
        handle,
        host,
        port,
        micropython_version: micropython_version ?? null,
        software_version: software_version ?? null,
        board: board ?? null,
        board_cpu_freq_mhz: board_cpu_freq_mhz ?? 0,
        board_total_fs_byte: board_total_fs_byte ?? 0,
        board_total_mem_byte: board_total_mem_byte ?? 0,
      };
    } else {
      Object.assign(unit, unitDto);
    }

    unit.last_seen = new Date();
    return await this.picoUnitRepo.save(unit);
  }

  async getByIdOrThrow(id: number): Promise<PicoUnit> {
    const unit = await this.picoUnitRepo.findOne({ where: { id } });
    if (!unit) {
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
      where.push({ ...base, host: like });
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

  async update(unit: PicoUnit, dto: UpdatePicoUnitDto): Promise<PicoUnit> {
    Object.assign(unit, dto);
    return await this.picoUnitRepo.save(unit);
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
    await axios.get(`${unit.address}/ping`, { timeout: 5000 });
    await this.touch(unit);
    return 'pong';
  }
}
