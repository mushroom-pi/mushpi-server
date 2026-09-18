import { Injectable, Logger } from '@nestjs/common';

import * as fs from 'fs';
import * as os from 'os';
import { version } from 'package.json';
import * as path from 'path';

import {
  databases as configDb,
  services as configServices,
} from 'src/modules/config/config.constants';
import { CustomConfigService } from 'src/modules/config/config.service';
import { SQLiteHealthService } from 'src/modules/sqlite-health/sqlite-health.service';

import {
  DatabaseStatus,
  HealthCheckInput,
  HealthCheckResponse,
  ServerStatus,
  ServiceStatus,
  SystemInfo,
  UpTime,
} from './monitoring.interface';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  constructor(
    private readonly configService: CustomConfigService,
    private readonly sqliteHealthService: SQLiteHealthService,
  ) {}

  private toMB(n: number): number {
    return parseFloat((n / 1024 / 1024).toFixed(2));
  }

  private buildUpTime(seconds: number): UpTime {
    return {
      seconds,
      minutes: Math.round((100 * seconds) / 60) / 100,
      hours: Math.round((100 * seconds) / (60 * 60)) / 100,
      days: Math.round((100 * seconds) / (60 * 60 * 24)) / 100,
    };
  }

  private checkServerStatus(): ServerStatus {
    const loadAverage = os.loadavg().map((avg) => parseFloat(avg.toFixed(2)));
    const memoryUsage = process.memoryUsage();
    Object.keys(memoryUsage).forEach(
      (k) => (memoryUsage[k] = this.toMB(memoryUsage[k])),
    );
    const upTimeSeconds = parseFloat(process.uptime().toFixed(2));

    return {
      healthy: true,
      environment: this.configService.server.nodeEnv,
      appVersion: version,
      nodeVersion: process.version,
      loadAverage,
      memoryUsageInMB: memoryUsage,
      upTime: this.buildUpTime(upTimeSeconds),
    };
  }

  private checkSystemStatus(): SystemInfo {
    const cpus = os.cpus();
    const dbPath = this.configService.sqlite.database;

    let disk: SystemInfo['disk'];
    if (dbPath === ':memory:') {
      disk = { path: dbPath, totalMb: null, freeMb: null };
    } else {
      const dir = path.dirname(path.resolve(dbPath));
      try {
        const stat = fs.statfsSync(dir);
        disk = {
          path: dir,
          totalMb: this.toMB(stat.bsize * stat.blocks),
          freeMb: this.toMB(stat.bsize * stat.bfree),
        };
      } catch {
        disk = { path: dir, totalMb: null, freeMb: null };
      }
    }

    return {
      os: {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        hostname: os.hostname(),
        arch: os.arch(),
      },
      cpu: {
        model: cpus[0]?.model ?? 'unknown',
        cores: cpus.length,
      },
      memory: {
        totalMb: this.toMB(os.totalmem()),
        freeMb: this.toMB(os.freemem()),
      },
      upTime: this.buildUpTime(os.uptime()),
      disk,
    };
  }

  /**
   * Your Database health checks will be used HERE
   */
  private async checkDatabaseStatus(name: string): Promise<DatabaseStatus> {
    this.logger.log(`Checking ${name} Database status`);

    switch (name) {
      case 'sqlite':
        return await this.sqliteHealthService.checkSQLiteDbStatus();

      default:
        break;
    }
  }

  /**
   * Your Services health checks will be used HERE
   */
  private async checkServiceStatus(name: string): Promise<ServiceStatus> {
    this.logger.log(`Checking ${name} Service status`);

    switch (name) {
      case 'mockService':
        return {
          hasKey: true,
          available: true,
        };

      default:
        break;
    }
  }

  private makeList(names: string, originalList: string[]): string[] {
    if (names && names === 'none') return [];
    if (names && names !== 'all') {
      return names.split(',').map((name) => name.trim());
    }
    return originalList;
  }

  ping(): string {
    return 'pong';
  }

  async health({
    server,
    system,
    databases,
    services,
  }: HealthCheckInput): Promise<HealthCheckResponse> {
    const healthCheck: HealthCheckResponse = {};

    if (server !== 'false') {
      healthCheck.server = this.checkServerStatus();
    }

    if (system !== 'false') {
      healthCheck.system = this.checkSystemStatus();
    }

    const dbList = this.makeList(databases, configDb);
    for (const dbName of dbList) {
      if (!healthCheck.databases) healthCheck.databases = {};
      healthCheck.databases[dbName] = await this.checkDatabaseStatus(dbName);
    }

    const serviceList = this.makeList(services, configServices);
    for (const serviceName of serviceList) {
      if (!healthCheck.services) healthCheck.services = {};
      healthCheck.services[serviceName] =
        await this.checkServiceStatus(serviceName);
    }

    return healthCheck;
  }
}
