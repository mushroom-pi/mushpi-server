import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

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

  // spy on Logger at the instance level used inside the service
  // (service creates `new Logger(...)`, so we’ll spy per test)
  const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

  beforeEach(async () => {
    repo = createRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SQLiteHealthService,
        { provide: getRepositoryToken(Health), useValue: repo },
      ],
    }).compile();

    service = module.get(SQLiteHealthService);
    jest.clearAllMocks();
  });

  describe('checkSQLiteDbStatus', () => {
    it('returns {read:true, write:true} when create/save succeed', async () => {
      // write path uses repo.create() only
      repo.create!.mockReturnValue({} as Health);

      // read path creates + saves
      repo.save!.mockResolvedValue({ id: 1 } as Health);

      const res = await service.checkSQLiteDbStatus();

      expect(res).toEqual({ read: true, write: true });

      // create called at least twice (once per check)
      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledTimes(1);

      // debug log called (message text currently says "MongoDB" in your code)
      expect(debugSpy).toHaveBeenCalled();
    });

    it('returns {read:false, write:true} when save rejects (read failure)', async () => {
      repo.create!.mockReturnValue({} as Health);
      repo.save!.mockRejectedValue(new Error('save failed'));

      const res = await service.checkSQLiteDbStatus();

      expect(res).toEqual({ read: false, write: true });
      expect(errorSpy).toHaveBeenCalled(); // logged the failure
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

      expect(res).toEqual({ read: true, write: false });
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

      expect(res).toEqual({ read: false, write: false });
      expect(errorSpy).toHaveBeenCalledTimes(2);
    });
  });
});
