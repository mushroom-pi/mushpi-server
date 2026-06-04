import { Test, TestingModule } from '@nestjs/testing';

import { version } from 'package.json';

import { CustomConfigService } from 'src/modules/config/config.service';
import { SQLiteHealthService } from 'src/modules/sqlite-health/sqlite-health.service';

import { HealthCheckInput, HealthCheckResponse } from './monitoring.interface';
import { MonitoringService } from './monitoring.service';

const upTimeSeconds = 12345.67;
jest.mock('os', () => ({
  loadavg: jest.fn(() => [0.123, 0.456, 0.789]),
  uptime: jest.fn(() => upTimeSeconds),
}));

describe('MonitoringService', () => {
  let service: MonitoringService;

  const sqliteHealthMock = {
    checkSQLiteDbStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        {
          provide: CustomConfigService,
          useValue: {
            server: { nodeEnv: process.env.NODE_ENV },
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

  describe('checkDatabaseStatus("sqlite")', () => {
    it('should return connected/read/write from SQLiteHealthService (all ok)', async () => {
      sqliteHealthMock.checkSQLiteDbStatus.mockResolvedValue({
        read: true,
        write: true,
      });

      const res = await (service as any)['checkDatabaseStatus']('sqlite');

      expect(res).toEqual({
        read: true,
        write: true,
      });
      expect(sqliteHealthMock.checkSQLiteDbStatus).toHaveBeenCalledTimes(1);
    });

    it('should return connected:false if either read or write fails', async () => {
      sqliteHealthMock.checkSQLiteDbStatus.mockResolvedValue({
        read: true,
        write: false,
      });

      const res = await (service as any)['checkDatabaseStatus']('sqlite');

      expect(res).toEqual({
        read: true,
        write: false,
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
    it('should return health check response with server, databases, and services status', async () => {
      const input: HealthCheckInput = {};
      const result: HealthCheckResponse = await service.health(input);

      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('databases');
      expect(result).toHaveProperty('services');
    });

    it('should return an empty response if server, databases, and services are false or none', async () => {
      const input: HealthCheckInput = {
        server: 'false',
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
      expect(result).not.toHaveProperty('databases');
      expect(result).toHaveProperty('services');
    });
  });
});
