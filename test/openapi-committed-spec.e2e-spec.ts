import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for the committed OpenAPI contract (`spec/openapi.json`).
 *
 * Unlike `openapi-schemas.e2e-spec.ts` — which builds its document in-process
 * via ts-jest WITHOUT the @nestjs/swagger CLI plugin, so plugin-inferred
 * properties are invisible there — this suite reads the committed spec from
 * disk, i.e. the compiled-output document where the plugin DOES synthesise a
 * schema entry for every declared-but-undecorated entity property. That is
 * where the never-serialized TypeORM relations (`Readings.pico_unit`,
 * `PicoUnit.readings`, `Recipe.batches`) would reappear if their
 * `@ApiHideProperty()` decorators were ever dropped — `Readings.pico_unit`
 * as a REQUIRED property that no endpoint can satisfy.
 *
 * Read-only — parses a committed file; no app boot, no DB writes.
 */
describe('OpenAPI committed spec (e2e)', () => {
  let doc: any;

  beforeAll(() => {
    doc = JSON.parse(
      readFileSync(join(__dirname, '../spec/openapi.json'), 'utf8'),
    );
  });

  const schemas = () => doc.components.schemas;
  const requiredOf = (schemaName: string): string[] =>
    schemas()[schemaName].required ?? [];

  describe('Readings — pico_unit relation is hidden from the contract', () => {
    it('does not advertise pico_unit in properties or required', () => {
      expect(schemas().Readings.properties).not.toHaveProperty('pico_unit');
      expect(requiredOf('Readings')).not.toContain('pico_unit');
    });

    it('still advertises the stored identity columns (over-hiding guard)', () => {
      const props = schemas().Readings.properties;
      expect(props).toHaveProperty('pico_unit_id');
      expect(props).toHaveProperty('id');
      expect(props).toHaveProperty('ts');
      expect(requiredOf('Readings')).toContain('pico_unit_id');
      expect(requiredOf('Readings')).toContain('id');
      expect(requiredOf('Readings')).toContain('ts');
    });
  });

  describe('PicoUnit — readings relation is hidden from the contract', () => {
    it('does not advertise readings in properties or required', () => {
      expect(schemas().PicoUnit.properties).not.toHaveProperty('readings');
      expect(requiredOf('PicoUnit')).not.toContain('readings');
    });

    it('keeps the genuinely-serialized latest_reading as a Readings $ref', () => {
      const props = schemas().PicoUnit.properties;
      expect(props).toHaveProperty('latest_reading');
      expect(props.latest_reading.allOf?.[0]?.$ref).toMatch(/Readings$/);
    });

    it('does not leak readings into the inlined PollPicoUnitResponseDto', () => {
      expect(schemas().PollPicoUnitResponseDto.properties).not.toHaveProperty(
        'readings',
      );
    });
  });

  describe('Recipe — batches relation is hidden from the contract', () => {
    it('does not advertise batches in properties or required', () => {
      expect(schemas().Recipe.properties).not.toHaveProperty('batches');
      expect(requiredOf('Recipe')).not.toContain('batches');
    });
  });

  describe('Batch — legitimately serialized relations are NOT hidden', () => {
    it('keeps pico_unit and recipe (only the never-serialized relations hide)', () => {
      const props = schemas().Batch.properties;
      expect(props).toHaveProperty('pico_unit');
      expect(props).toHaveProperty('recipe');
      expect(props.pico_unit.allOf?.[0]?.$ref).toMatch(/PicoUnit$/);
      expect(props.recipe.allOf?.[0]?.$ref).toMatch(/Recipe$/);
    });
  });
});
