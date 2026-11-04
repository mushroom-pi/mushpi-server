import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { FindOperator, Repository } from 'typeorm';

import { PicoUnit } from './pico-unit.entity';
import { PicoUnitsService } from './pico-units.service';

/**
 * Regression coverage for the identity-erasure race.
 *
 * The poll/cron paths hand the cycle-start entity snapshot to the counter and
 * status mutators while a concurrent `announce` may already have refreshed the
 * row's identity columns (`ip`, `mac`, `port`, versions, board). A full-entity
 * `save(staleSnapshot)` rewrites EVERY column from that snapshot, silently
 * reverting the announced identity — the demo boot symptom was units stuck
 * with `ip = NULL`, which disables the mDNS→IP fallback (it requires a truthy
 * `ip`) and can only self-heal on a SUCCESSFUL poll that then never happens.
 * Every non-announce writer must therefore persist ONLY its own column
 * (`increment` / targeted `update`), never `save(entity)`.
 *
 * The fake repository reproduces the relevant TypeORM semantics exactly:
 *  - `save(entity)` overwrites the whole row from the passed object
 *  - `increment(conditions, property, value)` writes one column
 *    (`SET property = property + value` against the STORED value)
 *  - `update(conditions, partial)` merges only the keys present in `partial`
 *    and honours `IsNull()` operators in the conditions (the atomic set-once
 *    MAC guard)
 * so a whole-snapshot `save()` fails these tests while partial column writes
 * pass — the spec keeps its bite against reintroduced full-entity saves.
 */

type Row = Record<string, any>;

class FakePicoUnitRepo {
  readonly rows = new Map<number, Row>();

  readonly save = jest.fn(async (entity: Row) => {
    // TypeORM `save()` of an entity loaded from the DB issues an UPDATE of
    // every column — modelled as an in-place full overwrite of the stored row
    // so a stale snapshot reverts columns a concurrent announce had written.
    const stored = this.rows.get(entity.id as number) ?? {};
    if (!this.rows.has(entity.id as number)) this.rows.set(entity.id, stored);
    for (const key of Object.keys(stored)) delete stored[key];
    Object.assign(stored, entity);
    return stored;
  });

  readonly increment = jest.fn(
    async (conditions: Row, propertyPath: string, value: number) => {
      const matched = this.byConditions(conditions);
      for (const row of matched) {
        row[propertyPath] = ((row[propertyPath] as number) ?? 0) + value;
      }
      return { affected: matched.length };
    },
  );

  readonly update = jest.fn(async (conditions: Row, partial: Row) => {
    const matched = this.byConditions(conditions);
    for (const row of matched) Object.assign(row, partial);
    return { affected: matched.length };
  });

  readonly findOne = jest.fn(
    async ({ where }: { where: Row }) => this.byConditions(where)[0] ?? null,
  );

  readonly findOneBy = jest.fn(
    async (conditions: Row) => this.byConditions(conditions)[0] ?? null,
  );

  /** Rows whose plain-equality keys match and whose FindOperator keys pass. */
  private byConditions(conditions: Row): Row[] {
    return [...this.rows.values()].filter((row) =>
      Object.entries(conditions).every(([key, expected]) => {
        if (expected instanceof FindOperator) {
          return (
            expected.type === 'isNull' &&
            (row[key] === null || row[key] === undefined)
          );
        }
        return row[key] === expected;
      }),
    );
  }
}

/**
 * The row as a unit looks after a successful announce (identity present,
 * versions and board metadata from the handshake, one earlier failed poll).
 */
function announcedRow(): Row {
  return {
    id: 3,
    created_at: new Date('2026-10-01T00:00:00Z'),
    handle: 'unit-03',
    name: 'Grow Shelf C',
    description: null,
    face_color: '#7cb342',
    ip: '10.20.30.40',
    mac: 'aa:bb:cc:dd:ee:03',
    port: 5000,
    monitored: true,
    last_seen: new Date('2026-10-01T00:00:00Z'),
    micropython_version: 'v1.24.0',
    firmware_version: '1.2.0',
    api_version: 1,
    board: 'RPI_PICO2W',
    board_total_mem_byte: 262144,
    board_total_fs_byte: 2097152,
    board_cpu_freq_mhz: 150,
    failed_calls: 2,
    failed_readings: 1,
    consecutive_empty_readings: 4,
  };
}

/**
 * The cycle-start snapshot: the same row loaded BEFORE the announce landed —
 * identity columns still at seed/NULL values. This is the object the poll
 * failure paths pass back into the mutators after the announce raced ahead.
 */
function staleSnapshot(): Row {
  return {
    ...announcedRow(),
    name: null,
    description: null,
    face_color: null,
    ip: null,
    mac: null,
    port: 8099,
    last_seen: null,
    micropython_version: null,
    firmware_version: null,
    api_version: null,
    board: null,
    board_total_mem_byte: 0,
    board_total_fs_byte: 0,
    board_cpu_freq_mhz: 0,
    failed_calls: 0,
    failed_readings: 0,
    consecutive_empty_readings: 0,
  };
}

function asEntity(row: Row): PicoUnit {
  return row as unknown as PicoUnit;
}

const IDENTITY_KEYS = [
  'ip',
  'mac',
  'port',
  'firmware_version',
  'api_version',
  'micropython_version',
  'board',
  'board_total_mem_byte',
  'board_total_fs_byte',
  'board_cpu_freq_mhz',
  'name',
  'description',
  'face_color',
  'handle',
  'monitored',
] as const;

describe('PicoUnitsService stale-snapshot safety', () => {
  let service: PicoUnitsService;
  let repo: FakePicoUnitRepo;

  beforeEach(async () => {
    repo = new FakePicoUnitRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PicoUnitsService,
        {
          provide: getRepositoryToken(PicoUnit),
          useValue: repo as unknown as Repository<PicoUnit>,
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<PicoUnitsService>(PicoUnitsService);
  });

  /** Freshly stored announced row + pre-announce snapshot pair. */
  function raceSetup(): { stored: Row; stale: Row } {
    const stored = announcedRow();
    repo.rows.set(stored.id, stored);
    return { stored, stale: staleSnapshot() };
  }

  function expectIdentityIntact(stored: Row): void {
    const fresh = announcedRow();
    for (const key of IDENTITY_KEYS) {
      expect(stored[key]).toStrictEqual(fresh[key]);
    }
  }

  describe('addFailedCall', () => {
    it('increments only failed_calls — announce identity survives the stale snapshot', async () => {
      const { stored, stale } = raceSetup();

      const returned = await service.addFailedCall(asEntity(stale));

      // DB-side increment against the STORED value (2), not the snapshot (0)
      expect(stored.failed_calls).toBe(3);
      expectIdentityIntact(stored);
      // Counter mutators must never issue a full-entity write
      expect(repo.save).not.toHaveBeenCalled();
      // Return-value contract: caller-readable counter mutated in place
      expect(returned).toBe(stale as unknown as PicoUnit);
      expect(returned.failed_calls).toBe(1);
    });
  });

  describe('addFailedReading', () => {
    it('increments only failed_readings — announce identity survives', async () => {
      const { stored, stale } = raceSetup();

      await service.addFailedReading(asEntity(stale));

      expect(stored.failed_readings).toBe(2);
      expectIdentityIntact(stored);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('addEmptyReading', () => {
    it('increments only consecutive_empty_readings — announce identity survives', async () => {
      const { stored, stale } = raceSetup();

      const returned = await service.addEmptyReading(asEntity(stale));

      expect(stored.consecutive_empty_readings).toBe(5);
      expectIdentityIntact(stored);
      expect(repo.save).not.toHaveBeenCalled();
      // The poll path logs the in-memory value immediately after this call
      expect(returned.consecutive_empty_readings).toBe(1);
    });
  });

  describe('resetFailedReadings', () => {
    it('zeroes only failed_readings — other counters and identity survive', async () => {
      const { stored, stale } = raceSetup();

      await service.resetFailedReadings(asEntity(stale));

      expect(stored.failed_readings).toBe(0);
      // The stale snapshot's zeros must not leak into the other counter
      expect(stored.consecutive_empty_readings).toBe(4);
      expect(stored.failed_calls).toBe(2);
      expectIdentityIntact(stored);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('resetEmptyReadings', () => {
    it('zeroes only consecutive_empty_readings — identity survives', async () => {
      const { stored, stale } = raceSetup();

      await service.resetEmptyReadings(asEntity(stale));

      expect(stored.consecutive_empty_readings).toBe(0);
      expect(stored.failed_readings).toBe(1);
      expectIdentityIntact(stored);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('touch', () => {
    it('updates only last_seen — announce identity survives', async () => {
      const { stored, stale } = raceSetup();
      const before = new Date('2026-10-01T00:00:00Z');

      await service.touch(asEntity(stale));

      expect(stored.last_seen).toBeInstanceOf(Date);
      expect((stored.last_seen as Date).getTime()).toBeGreaterThan(
        before.getTime(),
      );
      expectIdentityIntact(stored);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('touchAndResetFailedCalls', () => {
    it('persists only its own columns — announce identity survives a stale snapshot', async () => {
      const { stored, stale } = raceSetup();

      await service.touchAndResetFailedCalls(
        asEntity(stale),
        'aa:bb:cc:dd:ee:03',
        {
          firmware_version: '1.3.0',
          api_version: 2,
          ip: '10.20.30.99',
        },
      );

      // Its own columns move...
      expect(stored.failed_calls).toBe(0);
      expect(stored.last_seen).toBeInstanceOf(Date);
      expect(stored.ip).toBe('10.20.30.99'); // overwrite-when-present
      expect(stored.firmware_version).toBe('1.3.0');
      expect(stored.api_version).toBe(2);
      // ...everything else keeps the announced values (the old full-entity
      // save reverted all of these from the pre-announce snapshot)
      expect(stored.mac).toBe('aa:bb:cc:dd:ee:03');
      expect(stored.port).toBe(5000);
      expect(stored.micropython_version).toBe('v1.24.0');
      expect(stored.board).toBe('RPI_PICO2W');
      expect(stored.board_total_mem_byte).toBe(262144);
      expect(stored.board_total_fs_byte).toBe(2097152);
      expect(stored.board_cpu_freq_mhz).toBe(150);
      expect(stored.name).toBe('Grow Shelf C');
      expect(stored.face_color).toBe('#7cb342');
      expect(stored.failed_readings).toBe(1);
      expect(stored.consecutive_empty_readings).toBe(4);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('never clobbers the stored ip when the unit reports none', async () => {
      const { stored, stale } = raceSetup();

      await service.touchAndResetFailedCalls(
        asEntity(stale),
        'aa:bb:cc:dd:ee:03',
        { ip: undefined },
      );

      expect(stored.ip).toBe('10.20.30.40');
      expect(stored.firmware_version).toBe('1.2.0');
      expect(stored.api_version).toBe(1);
      expectIdentityIntact(stored);
    });

    it('ignores malformed firmware/api values and preserves stored ones', async () => {
      const { stored, stale } = raceSetup();

      await service.touchAndResetFailedCalls(asEntity(stale), undefined, {
        firmware_version: 'not-semver',
        api_version: null,
        ip: '',
      });

      expect(stored.firmware_version).toBe('1.2.0');
      expect(stored.api_version).toBe(1);
      expect(stored.ip).toBe('10.20.30.40');
      expect(stored.failed_calls).toBe(0);
      expect(stored.last_seen).toBeInstanceOf(Date);
    });

    it('stores api_version values above the supported maximum (accept-and-flag)', async () => {
      const { stored, stale } = raceSetup();

      await service.touchAndResetFailedCalls(asEntity(stale), undefined, {
        api_version: 99,
      });

      expect(stored.api_version).toBe(99);
    });

    it('sets mac set-once: fills a NULL row and keeps the first value', async () => {
      const stored: Row = { ...announcedRow(), mac: null, ip: null };
      repo.rows.set(stored.id, stored);
      const stale = { ...stored } as Row;

      await service.touchAndResetFailedCalls(
        asEntity(stale),
        'aa:bb:cc:00:11:22',
      );
      expect(stored.mac).toBe('aa:bb:cc:00:11:22');

      await service.touchAndResetFailedCalls(
        asEntity(stale),
        'ff:ff:ff:ff:ff:ff',
      );
      expect(stored.mac).toBe('aa:bb:cc:00:11:22');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not overwrite an announce-stored mac from a stale null snapshot', async () => {
      const { stored, stale } = raceSetup();

      // Snapshot loaded before the announce stored the real MAC → stale null;
      // the atomic set-once guard judges the LIVE row, so the announced MAC
      // survives even though the snapshot says "not set yet".
      expect(stale.mac).toBeNull();
      await service.touchAndResetFailedCalls(
        asEntity(stale),
        'de:ad:be:ef:00:01',
      );

      expect(stored.mac).toBe('aa:bb:cc:dd:ee:03');
      expectIdentityIntact(stored);
    });

    it('resets failed_calls without touching the sensor counters', async () => {
      const { stored, stale } = raceSetup();

      await service.touchAndResetFailedCalls(asEntity(stale), undefined);

      expect(stored.failed_calls).toBe(0);
      expect(stored.failed_readings).toBe(1);
      expect(stored.consecutive_empty_readings).toBe(4);
      expectIdentityIntact(stored);
    });
  });
});
