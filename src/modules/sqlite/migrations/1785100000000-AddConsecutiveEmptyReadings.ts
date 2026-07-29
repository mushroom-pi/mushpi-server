import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsecutiveEmptyReadings1785100000000
  implements MigrationInterface
{
  name = 'AddConsecutiveEmptyReadings1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE pico_unit ADD COLUMN consecutive_empty_readings INTEGER NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE pico_unit DROP COLUMN consecutive_empty_readings`,
    );
  }
}
