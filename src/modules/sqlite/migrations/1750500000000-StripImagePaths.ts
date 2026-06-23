import { MigrationInterface, QueryRunner } from 'typeorm';

export class StripImagePaths1750500000000 implements MigrationInterface {
  name = 'StripImagePaths1750500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Recipes: strip /images/recipes/ prefix, keep external URLs as-is
    await queryRunner.query(`
      UPDATE recipe
      SET image = REPLACE(image, '/images/recipes/', '')
      WHERE image IS NOT NULL
        AND image NOT LIKE 'http://%'
        AND image NOT LIKE 'https://%'
        AND image LIKE '/images/recipes/%'
    `);

    // Batches: strip /images/batches/{id}/ prefix from each entry in the JSON array
    const batches: { id: number; images: string }[] = await queryRunner.query(
      `SELECT id, images FROM batch WHERE images IS NOT NULL AND images != '[]'`,
    );
    for (const batch of batches) {
      try {
        const arr: string[] = JSON.parse(batch.images);
        const prefix = `/images/batches/${batch.id}/`;
        const stripped = arr.map((p) =>
          p.startsWith(prefix) ? p.slice(prefix.length) : p,
        );
        await queryRunner.query(`UPDATE batch SET images = ? WHERE id = ?`, [
          JSON.stringify(stripped),
          batch.id,
        ]);
      } catch {
        // skip malformed JSON
      }
    }
  }

  public async down(): Promise<void> {
    // Non-destructive down: re-adding prefixes is not possible without
    // knowing the batch id context for each filename, so this is a no-op.
  }
}
