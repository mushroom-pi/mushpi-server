import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateRecipeImagePaths1728400000000 implements MigrationInterface {
  name = 'UpdateRecipeImagePaths1728400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE recipe 
      SET image = '/images/recipes/' || image 
      WHERE image IS NOT NULL 
        AND image NOT LIKE 'http://%' 
        AND image NOT LIKE 'https://%'
        AND image NOT LIKE '/images/%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE recipe 
      SET image = REPLACE(image, '/images/recipes/', '') 
      WHERE image LIKE '/images/recipes/%'
    `);
  }
}
