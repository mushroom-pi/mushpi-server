import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSettingsTable1785498660000 implements MigrationInterface {
  name = 'CreateSettingsTable1785498660000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL, "timezone" text NOT NULL DEFAULT ('UTC'))`,
    );
    await queryRunner.query(
      `INSERT INTO "settings" ("id", "timezone") VALUES (1, 'UTC')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settings"`);
  }
}
