import { Test, TestingModule } from '@nestjs/testing';

import { version } from 'package.json';

import { CustomConfigService } from 'src/modules/config/config.service';
import { SQLiteHealthService } from 'src/modules/sqlite-health/sqlite-health.service';

import {
  HealthCheckInput,
  HealthCheckResponse,
  SystemInfo,
} from './monitoring.interface';
import { MonitoringService } from './monitoring.service';

const upTimeSeconds = 12345.67;
jest.mock('os', () => ({
  loadavg: jest.fn(() => [0.123, 0.456, 0.789]),
  uptime: jest.fn(() => upTimeSeconds),
  platform: jest.fn(() => 'linux'),
  type: jest.fn(() => 'Linux'),
  release: jest.fn(() => '5.15.0-v8+'),
  hostname: jest.fn(() => 'raspberrypi'),
  arch: jest.fn(() => 'arm64'),
  cpus: jest.fn(() => [
    { model: 'ARM Cortex-A72' },
    { model: 'ARM Cortex-A72' },
    { model: 'ARM Cortex-A72' },
    { model: 'ARM Cortex-A72' },
  ]),
  totalmem: jest.fn(() => 8 * 1024 * 1024 * 1024),
  freemem: jest.fn(() => 4 * 1024 * 1024 * 1024),
}));

const mockStatfsSync = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  statfsSync: (...args: unknown[]) => mockStatfsSync(...args),
}));

describe('MonitoringService', () => {
  let service: MonitoringService;

  const defaultSizeMock = {
    totalMb: null,
    inMemory: true,
    path: ':memory:',
    tables: [],
  };

  const sqliteHealthMock = {
    checkSQLiteDbStatus: jest.fn(),
    getDatabaseSize: jest.fn().mockResolvedValue(defaultSizeMock),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        {
          provide: CustomConfigService,
          useValue: {
            server: { nodeEnv: process.env.NODE_ENV },
            sqlite: { database: ':memory:' },
          },
        },
        {
          provide: SQLiteHealthService,
          useValue: sqliteHealthMock,
        },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toMB', () => {
    it('should convert bytes to megabytes', () => {
      expect(service['toMB'](1024 * 1024)).toBe(1.0); // 1 MB
    });
  });

  describe('makeList', () => {
    it('should return an empty array if names is "none"', () => {
      expect(service['makeList']('none', ['default'])).toEqual([]);
    });

    it('should split names by comma and trim spaces', () => {
      expect(service['makeList']('db1, db2', ['default'])).toEqual([
        'db1',
        'db2',
      ]);
    });

    it('should return the original list if names is "all" or not provided', () => {
      expect(service['makeList']('all', ['db1', 'db2'])).toEqual([
        'db1',
        'db2',
      ]);
      expect(service['makeList'](undefined, ['db1', 'db2'])).toEqual([
        'db1',
        'db2',
      ]);
    });
  });

  describe('checkServerStatus', () => {
    it('should return the server status', () => {
      // Mock process.memoryUsage to return a known state
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 10485760, // 10 MB
        heapTotal: 5242880, // 5 MB
        heapUsed: 3145728, // 3 MB
        external: 1048576, // 1 MB
        arrayBuffers: 524288, // 0.5 MB
      });

      jest.spyOn(process, 'uptime').mockReturnValue(12345.678);
      jest.spyOn(process, 'uptime').mockReturnValue(upTimeSeconds);

      const result = service['checkServerStatus']();
      expect(result).toEqual({
        healthy: true,
        environment: 'test',
        loadAverage: [0.12, 0.46, 0.79],
        memoryUsageInMB: {
          rss: 10,
          heapTotal: 5,
          heapUsed: 3,
          external: 1,
          arrayBuffers: 0.5,
        },
        upTime: {
          seconds: upTimeSeconds,
          minutes: Math.round((100 * upTimeSeconds) / 60) / 100,
          hours: Math.round((100 * upTimeSeconds) / (60 * 60)) / 100,
          days: Math.round((100 * upTimeSeconds) / (60 * 60 * 24)) / 100,
        },
        nodeVersion: process.version,
        appVersion: version,
      });
    });
  });

  describe('buildUpTime', () => {
    it('should compute seconds, minutes, hours, days correctly', () => {
      const result = service['buildUpTime'](90061); // 1 day, 1 hour, 1 minute, 1 second
      expect(result).toEqual({
        seconds: 90061,
        minutes: Math.round((100 * 90061) / 60) / 100,
        hours: Math.round((100 * 90061) / (60 * 60)) / 100,
        days: Math.round((100 * 90061) / (60 * 60 * 24)) / 100,
      });
    });
  });

  describe('checkSystemStatus', () => {
    function verifySystemInfoShape(result: SystemInfo) {
      // os
      expect(result).toHaveProperty('os');
      expect(typeof result.os.platform).toBe('string');
      expect(typeof result.os.type).toBe('string');
      expect(typeof result.os.release).toBe('string');
      expect(typeof result.os.hostname).toBe('string');
      expect(typeof result.os.arch).toBe('string');

      // cpu
      expect(result).toHaveProperty('cpu');
      expect(typeof result.cpu.model).toBe('string');
      expect(typeof result.cpu.cores).toBe('number');

      // memory
      expect(result).toHaveProperty('memory');
      expect(typeof result.memory.totalMb).toBe('number');
      expect(typeof result.memory.freeMb).toBe('number');

      // upTime
      expect(result).toHaveProperty('upTime');
      expect(typeof result.upTime.seconds).toBe('number');
      expect(typeof result.upTime.minutes).toBe('number');
      expect(typeof result.upTime.hours).toBe('number');
      expect(typeof result.upTime.days).toBe('number');

      // disk
      expect(result).toHaveProperty('disk');
      expect(typeof result.disk.path).toBe('string');
    }

    it('should return system info with :memory: disk', () => {
      const result = service['checkSystemStatus']();
      verifySystemInfoShape(result);

      expect(result.os).toEqual({
        platform: 'linux',
        type: 'Linux',
        release: '5.15.0-v8+',
        hostname: 'raspberrypi',
        arch: 'arm64',
      });
      expect(result.cpu).toEqual({
        model: 'ARM Cortex-A72',
        cores: 4,
      });
      expect(result.memory.totalMb).toBe(8192);
      expect(result.memory.freeMb).toBe(4096);
      expect(result.disk).toEqual({
        path: ':memory:',
        totalMb: null,
        freeMb: null,
      });
    });

    it('should return disk with null values when statfsSync throws', () => {
      // Override config to use a real path that will trigger statfsSync
      mockStatfsSync.mockImplementation(() => {
        throw new Error('EPERM');
      });

      // Temporarily override configService.sqlite.database
      const origSqlite = (service as any).configService.sqlite;
      (service as any).configService.sqlite = { database: '/tmp/test.db' };

      const result = service['checkSystemStatus']();
      expect(result.disk).toEqual({
        path: '/tmp',
        totalMb: null,
        freeMb: null,
      });

      // Restore
      (service as any).configService.sqlite = origSqlite;
      mockStatfsSync.mockReset();
    });
  });

  describe('checkDatabaseStatus("sqlite")', () => {
    it('should return connected/read/write from SQLiteHealthService (all ok)', async () => {
      sqliteHealthMock.checkSQLiteDbStatus.mockResolvedValue({
        read: true,
        write: true,
        size: defaultSizeMock,
      });

      const res = await (service as any)['checkDatabaseStatus']('sqlite');

      expect(res).toEqual({
        read: true,
        write: true,
        size: defaultSizeMock,
      });
      expect(sqliteHealthMock.checkSQLiteDbStatus).toHaveBeenCalledTimes(1);
    });

    it('should return connected:false if either read or write fails', async () => {
      sqliteHealthMock.checkSQLiteDbStatus.mockResolvedValue({
        read: true,
        write: false,
        size: defaultSizeMock,
      });

      const res = await (service as any)['checkDatabaseStatus']('sqlite');

      expect(res).toEqual({
        read: true,
        write: false,
        size: defaultSizeMock,
      });
    });
  });

  describe('checkServiceStatus', () => {
    it('should return a mocked service status', async () => {
      const result = await service['checkServiceStatus']('mockService');
      expect(result).toEqual({
        hasKey: true,
        available: true,
      });
    });

    it('should return undefined for unsupported service names', async () => {
      const status = await service['checkServiceStatus']('unsupported-service');
      expect(status).toBeUndefined();
    });
  });

  describe('health', () => {
    it('should return health check response with server, system, databases, and services status', async () => {
      const input: HealthCheckInput = {};
      const result: HealthCheckResponse = await service.health(input);

      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('databases');
      expect(result).toHaveProperty('services');
    });

    it('should return an empty response if server, system, databases, and services are false or none', async () => {
      const input: HealthCheckInput = {
        server: 'false',
        system: 'false',
        databases: 'none',
        services: 'none',
      };
      const result: HealthCheckResponse = await service.health(input);
      expect(result).toEqual({});
    });

    it('should return the desired parts of the response', async () => {
      const input: HealthCheckInput = {
        databases: 'none',
        services: 'mongoService',
      };
      const result: HealthCheckResponse = await service.health(input);

      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('system');
      expect(result).not.toHaveProperty('databases');
      expect(result).toHaveProperty('services');
    });

    it('should omit system when system is "false"', async () => {
      const input: HealthCheckInput = {
        server: 'false',
        system: 'false',
        databases: 'none',
        services: 'none',
      };
      const result: HealthCheckResponse = await service.health(input);
      expect(result).not.toHaveProperty('system');
    });

    it('should include system by default', async () => {
      const input: HealthCheckInput = {
        server: 'false',
        databases: 'none',
        services: 'none',
      };
      const result: HealthCheckResponse = await service.health(input);
      expect(result).toHaveProperty('system');
      expect(result.system).toHaveProperty('os');
      expect(result.system).toHaveProperty('cpu');
      expect(result.system).toHaveProperty('memory');
      expect(result.system).toHaveProperty('upTime');
      expect(result.system).toHaveProperty('disk');
    });
  });
});
