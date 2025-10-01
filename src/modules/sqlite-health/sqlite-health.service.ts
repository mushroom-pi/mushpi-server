import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { DatabaseStatus } from 'src/modules/monitoring/monitoring.inferface';

import { Health } from './sqlite-health.entity';

@Injectable()
export class SQLiteHealthService {
  private readonly logger = new Logger(SQLiteHealthService.name);

  constructor(
    @InjectRepository(Health) private healthRepo: Repository<Health>,
  ) {}

  create() {
    const health = this.healthRepo.create();
    return this.healthRepo.save(health);
  }

  private async checkWriteStatus(): Promise<boolean> {
    try {
      this.healthRepo.create({});
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

  async checkSQLiteDbStatus(): Promise<DatabaseStatus> {
    this.logger.debug('Checking MongoDB status');

    return {
      read: await this.checkReadStatus(),
      write: await this.checkWriteStatus(),
    };
  }
}
