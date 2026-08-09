import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import * as fs from 'fs';
import { DataSource, Repository } from 'typeorm';

import { CustomConfigService } from 'src/modules/config/config.service';
import {
  DatabaseSizeStatus,
  DatabaseStatus,
  TableSize,
} from 'src/modules/monitoring/monitoring.interface';

import { Health } from './sqlite-health.entity';

@Injectable()
export class SQLiteHealthService {
  private readonly logger = new Logger(SQLiteHealthService.name);

  constructor(
    @InjectRepository(Health) private healthRepo: Repository<Health>,
    private readonly dataSource: DataSource,
    private readonly configService: CustomConfigService,
  ) {}

  create() {
    const health = this.healthRepo.create();
    return this.healthRepo.save(health);
  }

  private async checkWriteStatus(): Promise<boolean> {
    try {
      const health = this.healthRepo.create({});
      await this.healthRepo.save(health);
      return true;
    } catch (error) {
      this.logger.error(
        error,
        'Something went wrong while trying to write on the database',
      );
      return false;
    }
  }

  private async checkReadStatus(): Promise<boolean> {
    try {
      const health = this.healthRepo.create();
      await this.healthRepo.save(health);
      return true;
    } catch (error) {
      this.logger.error(
        error,
        'Something went wrong while trying to write on the database',
      );
      return false;
    }
  }

  private toMB(bytes: number): number {
    return parseFloat((bytes / 1048576).toFixed(2));
  }

  async getDatabaseSize(): Promise<DatabaseSizeStatus> {
    const dbPath = this.configService.sqlite.database;
    const inMemory = dbPath === ':memory:';

    let totalMb: number | null = null;
    if (!inMemory) {
      try {
        const stat = fs.statSync(dbPath);
        totalMb = this.toMB(stat.size);
      } catch {
        totalMb = null;
      }
    }

    let tables: TableSize[];
    try {
      const rows: Array<{ name: string; bytes: number }> =
        await this.dataSource.query(
          `SELECT m.name AS name, COALESCE(SUM(s.pgsize), 0) AS bytes
           FROM sqlite_master m
           LEFT JOIN dbstat s ON s.name = m.name
           WHERE m.type IN ('table', 'index') AND m.name NOT LIKE 'sqlite_%'
           GROUP BY m.name
           ORDER BY bytes DESC`,
        );
      tables = rows.map((r) => ({
        name: r.name,
        sizeMb: this.toMB(r.bytes),
      }));
    } catch {
      // dbstat unavailable — fall back to row counts
      const tableRows: Array<{ name: string }> = await this.dataSource.query(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      );

      const withCounts = await Promise.all(
        tableRows.map(async (t) => {
          const countRow: Array<{ c: number }> = await this.dataSource.query(
            `SELECT COUNT(*) AS c FROM [${t.name}]`,
          );
          return { name: t.name, rowCount: countRow[0].c };
        }),
      );

      tables = withCounts
        .sort((a, b) => b.rowCount - a.rowCount)
        .map((t) => ({ name: t.name, sizeMb: null, rowCount: t.rowCount }));
    }

    const accounted = tables.reduce((sum, t) => sum + (t.sizeMb ?? 0), 0);
    const overheadMb =
      totalMb != null
        ? Math.max(0, parseFloat((totalMb - accounted).toFixed(2)))
        : null;

    return { totalMb, inMemory, path: dbPath, tables, overheadMb };
  }

  async checkSQLiteDbStatus(): Promise<DatabaseStatus> {
    this.logger.debug('Checking SQLite status');

    return {
      read: await this.checkReadStatus(),
      write: await this.checkWriteStatus(),
      size: await this.getDatabaseSize(),
    };
  }
}
