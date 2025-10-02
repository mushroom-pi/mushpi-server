import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

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
  ) {}

  async upsert({ handle, host, port }: UpsertPicoUnitDto): Promise<PicoUnit> {
    // Set the fields you want to (re)apply on conflict
    await this.picoUnitRepo.upsert(
      { handle, host, port, last_seen: new Date() }, // partial entity
      { conflictPaths: ['host', 'port'], skipUpdateIfNoValuesChanged: true },
    );

    // Fetch the current row after upsert
    return this.picoUnitRepo.findOneOrFail({ where: { host, port } });
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

  async update(unit: PicoUnit, dto: UpdatePicoUnitDto): Promise<PicoUnit> {
    Object.assign(unit, dto);
    return await this.picoUnitRepo.save(unit);
  }

  async removeById(id: number): Promise<void> {
    await this.picoUnitRepo.delete(id);
    return;
  }
}
