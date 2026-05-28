import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';
import { RecipesService } from 'src/modules/recipes/recipes.service';

import {
  BATCH_EVENTS,
  BatchFinishedEvent,
  BatchStartedEvent,
} from './batch.events';
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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateBatchDto): Promise<Batch> {
    await this.picoUnitsService.getByIdOrThrow(dto.pico_unit_id, true);
    const activeBatch = await this.currentForUnit(dto.pico_unit_id);

    const createData: Partial<Batch> = { ...dto } as unknown as Partial<Batch>;

    if (activeBatch) {
      // If there's an active batch without a defined finish_at, cannot create new batch
      if (!activeBatch.finish_at) {
        throw new ConflictException(
          `Pico unit ${dto.pico_unit_id} already has an active batch (id: ${activeBatch.id}) with no defined end. Finish it before starting a new one.`,
        );
      }

      // If there's an active batch with finish_at, new batch's start_at must be after finish_at
      // Parse start_at from DTO (string -> Date)
      const newBatchStart = dto.start_at ? new Date(dto.start_at) : new Date();

      if (activeBatch.finish_at >= newBatchStart) {
        throw new ConflictException(
          `Pico unit ${dto.pico_unit_id} already has an active batch (id: ${activeBatch.id}) finishing at ${activeBatch.finish_at.toISOString()}. Start the new batch after that time.`,
        );
      }
    }

    if (dto.recipe_id != null) {
      const recipe = await this.recipesService.findOne(dto.recipe_id);
      if (dto.species == null) createData.species = recipe.species;
      if (dto.temperature_target == null)
        createData.temperature_target = recipe.temperature_target;
      if (dto.humidity_target == null)
        createData.humidity_target = recipe.humidity_target;
    }

    const batch = this.batchRepo.create(createData);
    const saved = await this.batchRepo.save(batch);
    // Load relations so the response and the event payload are fully hydrated
    const hydrated = await this.getByIdOrThrow(saved.id);
    if (hydrated.status === 'in-progress') {
      this.eventEmitter.emit(
        BATCH_EVENTS.STARTED,
        new BatchStartedEvent(hydrated),
      );
    }
    return hydrated;
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
    const now = new Date();
    const wasInProgress = batch.status === 'in-progress';

    // Check if start_at has already happened (batch has started)
    if (batch.start_at < now) {
      // Cannot modify start_at if the batch has already started
      if (dto.start_at !== undefined) {
        throw new PreconditionFailedException(
          'Cannot modify start_at: batch has already started',
        );
      }
    }

    // Check if finish_at has already happened (batch is finished)
    if (batch.finish_at && batch.finish_at < now) {
      // Only allow modifications to description and notes
      const allowedFields = ['description', 'notes'];
      const modifiedFields = Object.keys(dto).filter(
        (key) => dto[key as keyof UpdateBatchDto] !== undefined,
      );
      const disallowedFields = modifiedFields.filter(
        (field) => !allowedFields.includes(field),
      );

      if (disallowedFields.length > 0) {
        throw new PreconditionFailedException(
          `Cannot modify ${disallowedFields.join(', ')}: batch has already finished. Only description and notes can be modified.`,
        );
      }
    }

    Object.assign(batch, dto);
    const saved = await this.batchRepo.save(batch);
    const hydrated = await this.getByIdOrThrow(saved.id);

    if (wasInProgress && hydrated.status === 'finished') {
      this.eventEmitter.emit(
        BATCH_EVENTS.FINISHED,
        new BatchFinishedEvent(hydrated),
      );
    }

    return hydrated;
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

  async findAllInProgress(): Promise<Batch[]> {
    const now = new Date();
    return this.batchRepo.find({
      where: [
        { start_at: LessThan(now), finish_at: IsNull() },
        { start_at: LessThan(now), finish_at: MoreThan(now) },
      ],
      relations: ['pico_unit'],
    });
  }

  async findInProgressForUnit(picoUnitId: number): Promise<Batch | null> {
    const now = new Date();
    return this.batchRepo.findOne({
      where: [
        {
          pico_unit_id: picoUnitId,
          start_at: LessThan(now),
          finish_at: IsNull(),
        },
        {
          pico_unit_id: picoUnitId,
          start_at: LessThan(now),
          finish_at: MoreThan(now),
        },
      ],
      relations: ['pico_unit'],
    });
  }

  async findUnitsWithFinishedBatch(): Promise<PicoUnit[]> {
    const now = new Date();

    const activeBatches = await this.findAllInProgress();
    const activeUnitIds = new Set(activeBatches.map((b) => b.pico_unit_id));

    const finishedBatches = await this.batchRepo.find({
      where: { finish_at: LessThan(now) },
      relations: ['pico_unit'],
    });

    const unitMap = new Map<number, PicoUnit>();
    for (const batch of finishedBatches) {
      if (!activeUnitIds.has(batch.pico_unit_id) && batch.pico_unit?.enabled) {
        unitMap.set(batch.pico_unit_id, batch.pico_unit);
      }
    }

    return Array.from(unitMap.values());
  }

  private async listInternal(
    query: ListBatchesQueryDto,
    options: { includePicoUnit?: boolean; includeRecipe?: boolean } = {},
  ) {
    const { includePicoUnit = false, includeRecipe = false } = options;
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

    const relations = [];
    if (includePicoUnit) relations.push('pico_unit');
    if (includeRecipe) relations.push('recipe');

    const [items, total] = await this.batchRepo.findAndCount({
      where,
      order: { id: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
      relations,
    });

    return {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async list(query: ListBatchesQueryDto) {
    return this.listInternal(query, {
      includePicoUnit: true,
      includeRecipe: true,
    });
  }

  async listForPicoUnitId(
    pico_unit_id: number,
    query: ListPicoUnitBatchesQueryDto,
  ) {
    return this.listInternal(
      { ...query, pico_unit_id },
      {
        includeRecipe: true,
      },
    );
  }

  async listForRecipeId(recipe_id: number, query: ListPicoUnitBatchesQueryDto) {
    return this.listInternal(
      { ...query, recipe_id },
      {
        includePicoUnit: true,
      },
    );
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
