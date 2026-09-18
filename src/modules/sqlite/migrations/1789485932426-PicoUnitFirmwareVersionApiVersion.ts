/**
 * PicoUnit.software_version → firmware_version rename + new nullable api_version.
 *
 * Pico version metadata (storage half): firmware_version is the existing
 * column renamed (all stored values preserved — pure rename, no data loss);
 * api_version carries the Pico↔Server REST contract generation. NULL means
 * "the unit has never reported it" — the seed of the "needs firmware update"
 * state in the computed `api_compatibility` verdict.
 *
 * Statements are guarded with hasColumn() so the migration is a no-op on
 * databases that already match the new shape — the same "safe against
 * synchronize-created DBs" convention used by the baseline migration's
 * CREATE TABLE IF NOT EXISTS. Without the guards, RENAME/ADD would throw on a
 * dev DB already synced with the renamed entity.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class PicoUnitFirmwareVersionApiVersion1789485932426
  implements MigrationInterface
{
  name = 'PicoUnitFirmwareVersionApiVersion1789485932426';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename preserves all existing values (pure column rename, no data loss).
    const hasSoftware = await queryRunner.hasColumn(
      'pico_unit',
      'software_version',
    );
    const hasFirmware = await queryRunner.hasColumn(
      'pico_unit',
      'firmware_version',
    );
    if (hasSoftware && !hasFirmware) {
      await queryRunner.query(
        `ALTER TABLE "pico_unit" RENAME COLUMN "software_version" TO "firmware_version"`,
      );
    }
    // Nullable, no default: existing rows get NULL — distinguishable from a reported value.
    if (!(await queryRunner.hasColumn('pico_unit', 'api_version'))) {
      await queryRunner.query(
        `ALTER TABLE "pico_unit" ADD COLUMN "api_version" integer`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('pico_unit', 'api_version')) {
      await queryRunner.query(
        `ALTER TABLE "pico_unit" DROP COLUMN "api_version"`,
      );
    }
    const hasSoftware = await queryRunner.hasColumn(
      'pico_unit',
      'software_version',
    );
    const hasFirmware = await queryRunner.hasColumn(
      'pico_unit',
      'firmware_version',
    );
    if (hasFirmware && !hasSoftware) {
      await queryRunner.query(
        `ALTER TABLE "pico_unit" RENAME COLUMN "firmware_version" TO "software_version"`,
      );
    }
  }
}
