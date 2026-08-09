import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { CustomConfigService } from 'src/modules/config/config.service';

import { Health } from './sqlite-health.entity';
import { SQLiteHealthService } from './sqlite-health.service';

type RepoMock = Partial<Record<keyof Repository<Health>, jest.Mock>>;

const createRepoMock = (): RepoMock => ({
  create: jest.fn(),
  save: jest.fn(),
});

describe('SQLiteHealthService', () => {
  let service: SQLiteHealthService;
  let repo: RepoMock;
  let dataSourceMock: { query: jest.Mock };
  let configServiceMock: { sqlite: { database: string } };

  // spy on Logger at the instance level used inside the service
  // (service creates `new Logger(...)`, so we'll spy per test)
  const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

  beforeEach(async () => {
    repo = createRepoMock();
    dataSourceMock = { query: jest.fn() };
    configServiceMock = { sqlite: { database: ':memory:' } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SQLiteHealthService,
        { provide: getRepositoryToken(Health), useValue: repo },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: CustomConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get(SQLiteHealthService);
    jest.clearAllMocks();
    // Default: dbstat returns empty tables (used by checkSQLiteDbStatus tests)
    dataSourceMock.query.mockResolvedValue([]);
  });

  describe('checkSQLiteDbStatus', () => {
    it('returns {read:true, write:true, size} when create/save succeed', async () => {
      // both read and write paths use repo.create() + repo.save()
      repo.create!.mockReturnValue({} as Health);
      repo.save!.mockResolvedValue({ id: 1 } as Health);

      const res = await service.checkSQLiteDbStatus();

      expect(res.read).toBe(true);
      expect(res.write).toBe(true);
      expect(res.size).toBeDefined();
      expect(res.size!.inMemory).toBe(true);
      expect(res.size!.totalMb).toBeNull();
      expect(res.size!.path).toBe(':memory:');

      // debug log called
      expect(debugSpy).toHaveBeenCalled();
    });

    it('returns {read:false, write:false} when save rejects (both fail)', async () => {
      repo.create!.mockReturnValue({} as Health);
      repo.save!.mockRejectedValue(new Error('save failed'));

      const res = await service.checkSQLiteDbStatus();

      expect(res).toMatchObject({ read: false, write: false });
      expect(errorSpy).toHaveBeenCalledTimes(2); // logged both failures
    });

    it('returns {read:true, write:false} when create throws (write failure)', async () => {
      // write check throws on create
      const createErr = new Error('create failed');
      // For read path we still need create + save to succeed once
      repo
        .create!.mockReturnValueOnce({} as Health) // used by read check
        .mockImplementationOnce(() => {
          throw createErr; // used by write check
        });

      repo.save!.mockResolvedValue({ id: 1 } as Health);

      const res = await service.checkSQLiteDbStatus();

      expect(res).toMatchObject({ read: true, write: false });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns {read:false, write:false} when both read and write fail', async () => {
      // First call (read path) -> create ok, save fails
      // Second call (write path) -> create throws
      repo
        .create!.mockReturnValueOnce({} as Health)
        .mockImplementationOnce(() => {
          throw new Error('create failed');
        });

      repo.save!.mockRejectedValue(new Error('save failed'));

      const res = await service.checkSQLiteDbStatus();

      expect(res).toMatchObject({ read: false, write: false });
      expect(errorSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDatabaseSize', () => {
    it('returns totalMb null and inMemory true for :memory:', async () => {
      configServiceMock.sqlite.database = ':memory:';
      dataSourceMock.query.mockResolvedValueOnce([]);

      const result = await service.getDatabaseSize();

      expect(result.totalMb).toBeNull();
      expect(result.inMemory).toBe(true);
      expect(result.path).toBe(':memory:');
      expect(result.tables).toEqual([]);
    });

    it('uses dbstat when available and returns tables with sizeMb', async () => {
      configServiceMock.sqlite.database = ':memory:';
      dataSourceMock.query.mockResolvedValueOnce([
        { name: 'readings', bytes: 859832 },
        { name: 'pico_unit', bytes: 31457 },
      ]);

      const result = await service.getDatabaseSize();

      expect(result.tables).toEqual([
        { name: 'readings', sizeMb: 0.82 },
        { name: 'pico_unit', sizeMb: 0.03 },
      ]);
      expect(result.tables[0].rowCount).toBeUndefined();
    });

    it('falls back to row counts when dbstat throws', async () => {
      configServiceMock.sqlite.database = ':memory:';
      dataSourceMock.query
        .mockRejectedValueOnce(new Error('no dbstat'))
        .mockResolvedValueOnce([{ name: 'readings' }, { name: 'pico_unit' }])
        .mockResolvedValueOnce([{ c: 500 }])
        .mockResolvedValueOnce([{ c: 10 }]);

      const result = await service.getDatabaseSize();

      expect(result.tables).toEqual([
        { name: 'readings', sizeMb: null, rowCount: 500 },
        { name: 'pico_unit', sizeMb: null, rowCount: 10 },
      ]);
    });
  });
});
