import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteZeroReadings1784571343324 implements MigrationInterface {
  name = 'DeleteZeroReadings1784571343324';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM readings WHERE temperature = 0 OR humidity = 0`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Data deletion is irreversible; no-op
  }
}
