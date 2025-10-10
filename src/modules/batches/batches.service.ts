import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';

import {
  CreateBatchDto,
  ListBatchesQueryDto,
  ListPicoUnitBatchesQueryDto,
  UpdateBatchDto,
} from './batches.dto';
import { Batch } from './batches.entity';

@Injectable()
export class BatchesService {
  constructor(
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    private readonly picoUnitsService: PicoUnitsService,
  ) {}

  async create(dto: CreateBatchDto): Promise<Batch> {
    await this.picoUnitsService.getByIdOrThrow(dto.pico_unit_id, true);
    const batch = this.batchRepo.create({
      ...dto,
    } as unknown as Partial<Batch>);

    return this.batchRepo.save(batch);
  }

  async getByIdOrThrow(id: number): Promise<Batch> {
    const batch = await this.batchRepo.findOne({
      where: { id },
      relations: ['pico_unit'],
    });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);

    return batch;
  }

  async update(batch: Batch, dto: UpdateBatchDto): Promise<Batch> {
    Object.assign(batch, dto);
    return this.batchRepo.save(batch);
  }

  async removeById(id: number): Promise<void> {
    await this.batchRepo.delete(id);
    return;
  }

  async latestForUnit(pico_unit_id: number): Promise<Batch | null> {
    return this.batchRepo.findOne({
      where: { pico_unit_id },
      order: { start_at: 'DESC' },
    });
  }

  async currentForUnit(pico_unit_id: number): Promise<Batch | null> {
    const now = new Date();
    return this.batchRepo.findOne({
      where: [
        { pico_unit_id, finish_at: IsNull() },
        { pico_unit_id, finish_at: MoreThan(now) },
      ],
      order: { start_at: 'DESC' },
    });
  }

  async currentForUnitOrThrow(picoUnitId: number): Promise<Batch> {
    const batch = await this.currentForUnit(picoUnitId);
    if (!batch)
      throw new NotFoundException(
        `Pico unit ${picoUnitId} doesn't have any current batch`,
      );
    return batch;
  }

  async list(query: ListBatchesQueryDto) {
    const now = new Date();
    const { page = 1, limit = 20, status, pico_unit_id } = query;

    const where: any[] = [];
    const base: any = {};

    if (pico_unit_id) base.pico_unit_id = pico_unit_id;
    if (status) {
      if (status === 'in-progress') {
        where.push([
          { ...base, finish_at: IsNull() },
          { ...base, finish_at: MoreThan(now) },
        ]);
      } else if (status === 'finished') {
        where.push([{ ...base, finish_at: LessThan(now) }]);
      }
    } else {
      where.push(base);
    }

    const [items, total] = await this.batchRepo.findAndCount({
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

  async listForPicoUnitId(
    pico_unit_id: number,
    query: ListPicoUnitBatchesQueryDto,
  ) {
    return this.list({ ...query, pico_unit_id });
  }
}
