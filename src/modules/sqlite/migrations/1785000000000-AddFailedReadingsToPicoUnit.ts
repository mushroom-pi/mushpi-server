import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFailedReadingsToPicoUnit1785000000000
  implements MigrationInterface
{
  name = 'AddFailedReadingsToPicoUnit1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE pico_unit ADD COLUMN failed_readings INTEGER NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE pico_unit DROP COLUMN failed_readings`,
    );
  }
}
