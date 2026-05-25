import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';
import { RecipesService } from 'src/modules/recipes/recipes.service';

import {
  CreateBatchDto,
  CreateRecipeFromBatchDto,
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
    private readonly recipesService: RecipesService,
  ) {}

  async create(dto: CreateBatchDto): Promise<Batch> {
    await this.picoUnitsService.getByIdOrThrow(dto.pico_unit_id, true);

    const activeBatch = await this.currentForUnit(dto.pico_unit_id);
    if (activeBatch) {
      throw new ConflictException(
        `Pico unit ${dto.pico_unit_id} already has an active batch (id: ${activeBatch.id}). Finish it before starting a new one.`,
      );
    }

    const createData: Partial<Batch> = { ...dto } as unknown as Partial<Batch>;

    if (dto.recipe_id != null) {
      const recipe = await this.recipesService.findOne(dto.recipe_id);
      if (dto.species == null) createData.species = recipe.species;
      if (dto.temperature_target == null)
        createData.temperature_target = recipe.temperature_target;
      if (dto.humidity_target == null)
        createData.humidity_target = recipe.humidity_target;
    }

    const batch = this.batchRepo.create(createData);
    return this.batchRepo.save(batch);
  }

  async getByIdOrThrow(id: number): Promise<Batch> {
    const batch = await this.batchRepo.findOne({
      where: { id },
      relations: ['pico_unit', 'recipe'],
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
    const { page = 1, limit = 20, status, pico_unit_id, recipe_id } = query;

    const where: any[] = [];
    const base: any = {};

    if (pico_unit_id) base.pico_unit_id = pico_unit_id;
    if (recipe_id) base.recipe_id = recipe_id;
    if (status) {
      if (status === 'planned') {
        where.push([{ ...base, start_at: MoreThan(now) }]);
      } else if (status === 'in-progress') {
        where.push([
          { ...base, finish_at: IsNull(), start_at: LessThan(now) },
          { ...base, finish_at: MoreThan(now), start_at: LessThan(now) },
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

  async listForRecipeId(recipe_id: number, query: ListPicoUnitBatchesQueryDto) {
    return this.list({ ...query, recipe_id });
  }

  async createRecipeFromBatch(batch: Batch, dto: CreateRecipeFromBatchDto) {
    if (batch.status !== 'finished') {
      throw new UnprocessableEntityException(
        'Only finished batches can be used to create a recipe',
      );
    }
    if (batch.species == null) {
      throw new UnprocessableEntityException(
        'Batch must have a species to create a recipe',
      );
    }
    if (batch.temperature_target == null) {
      throw new UnprocessableEntityException(
        'Batch must have a temperature_target to create a recipe',
      );
    }
    if (batch.humidity_target == null) {
      throw new UnprocessableEntityException(
        'Batch must have a humidity_target to create a recipe',
      );
    }

    const durationMs = batch.finish_at!.getTime() - batch.start_at.getTime();
    const duration_days = Math.max(
      1,
      Math.ceil(durationMs / (1000 * 60 * 60 * 24)),
    );

    return this.recipesService.create({
      name: dto.name,
      species: batch.species,
      temperature_target: batch.temperature_target,
      humidity_target: batch.humidity_target,
      duration_days,
      notes: dto.notes,
    });
  }
}
