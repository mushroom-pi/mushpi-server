import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatchImagesColumn1750400000000 implements MigrationInterface {
  name = 'AddBatchImagesColumn1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE batch ADD COLUMN images TEXT NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite does not support DROP COLUMN before version 3.35.0.
    // Re-creating the table without the column is the safe approach.
    await queryRunner.query(`
      CREATE TABLE batch_backup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finish_at DATETIME NULL DEFAULT NULL,
        species TEXT NULL DEFAULT NULL,
        temperature_target INTEGER NULL,
        humidity_target INTEGER NULL,
        notes TEXT NOT NULL DEFAULT '',
        description TEXT NULL DEFAULT NULL,
        pico_unit_id INTEGER NOT NULL REFERENCES pico_unit(id) ON DELETE CASCADE,
        recipe_id INTEGER NULL REFERENCES recipe(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO batch_backup SELECT id, start_at, finish_at, species, temperature_target, humidity_target, notes, description, pico_unit_id, recipe_id FROM batch
    `);
    await queryRunner.query(`DROP TABLE batch`);
    await queryRunner.query(`ALTER TABLE batch_backup RENAME TO batch`);
    await queryRunner.query(
      `CREATE INDEX IDX_batch_pico_unit_id ON batch(pico_unit_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IDX_batch_recipe_id ON batch(recipe_id)`,
    );
  }
}
