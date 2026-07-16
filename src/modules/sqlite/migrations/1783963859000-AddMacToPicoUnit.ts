import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMacToPicoUnit1783963859000 implements MigrationInterface {
  name = 'AddMacToPicoUnit1783963859000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pico_unit ADD COLUMN mac TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pico_unit DROP COLUMN mac`);
  }
}
