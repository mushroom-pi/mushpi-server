import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPicoUnitFaceColor1751500000000 implements MigrationInterface {
  name = 'AddPicoUnitFaceColor1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pico_unit ADD COLUMN face_color TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pico_unit DROP COLUMN face_color`);
  }
}
