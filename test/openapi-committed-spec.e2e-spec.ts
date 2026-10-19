import { readFileSync } from 'fs';
import { join } from 'path';

import { READONLY_FORBIDDEN_MESSAGE } from '../src/common/constants/readonly.constants';

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

  /**
   * Demo read-only contract documented in the committed spec: every operation
   * the `DemoReadOnlyGuard` refuses on a `NODE_ENV=demo` boot carries a `403`
   * response, and every operation it allows does not. The committed spec is
   * generated from a dev/local boot, so this block — not the generating
   * environment — is what pins the contract the public API reference renders.
   *
   * The refusal set is the method default (non-safe methods) plus explicitly
   * marked writes under safe methods; the exemption set is exactly the
   * operations carrying the `x-demo-readonly: exempt` extension.
   */
  describe('Demo read-only — 403 documentation invariant', () => {
    const op = (path: string, method: string) =>
      doc.paths[path]?.[method] ?? undefined;
    const has403 = (path: string, method: string): boolean =>
      op(path, method)?.responses?.['403'] !== undefined;

    const REFUSED: [string, string][] = [
      ['/v1/pico-units', 'post'],
      ['/v1/pico-units/{picoUnitId}', 'patch'],
      ['/v1/pico-units/{picoUnitId}', 'delete'],
      ['/v1/pico-units/{picoUnitId}/reboot', 'put'],
      ['/v1/pico-units/{picoUnitId}/poll', 'post'],
      ['/v1/pico-units/{picoUnitId}/control/setpoints', 'put'],
      ['/v1/pico-units/{picoUnitId}/control/outputs', 'put'],
      ['/v1/pico-units/{picoUnitId}/control/setup', 'put'],
      ['/v1/pico-units/{picoUnitId}/control/loop', 'put'],
      // Safe method, refused by explicit mark: the proxy records call
      // outcome on the unit row (last_seen / failed_calls).
      ['/v1/pico-units/{picoUnitId}/ping', 'get'],
      ['/v1/batches', 'post'],
      ['/v1/batches/{batchId}', 'patch'],
      ['/v1/batches/{batchId}', 'delete'],
      ['/v1/batches/{batchId}/recipe', 'post'],
      ['/v1/batches/{batchId}/images', 'put'],
      ['/v1/batches/{batchId}/images/{filename}', 'delete'],
      ['/v1/recipes', 'post'],
      ['/v1/recipes/{recipeId}', 'patch'],
      ['/v1/recipes/{recipeId}', 'delete'],
      ['/v1/recipes/{recipeId}/image', 'put'],
      ['/v1/recipes/{recipeId}/image', 'delete'],
      ['/v1/settings', 'patch'],
    ];

    const ALLOWED: [string, string][] = [
      // The sole exemption from the default refusal of non-safe methods.
      ['/v1/pico-units/announce', 'post'],
      // Plain safe-method views stay documented as they behave: readable
      // everywhere, never refused.
      ['/v1/pico-units', 'get'],
      ['/v1/pico-units/{picoUnitId}', 'get'],
      ['/v1/pico-units/{picoUnitId}/readings', 'get'],
      ['/v1/pico-units/{picoUnitId}/readings/export', 'get'],
      ['/v1/pico-units/{picoUnitId}/batches', 'get'],
      ['/v1/pico-units/{picoUnitId}/batches/current', 'get'],
      ['/v1/batches', 'get'],
      ['/v1/batches/{batchId}', 'get'],
      ['/v1/batches/{batchId}/readings', 'get'],
      ['/v1/batches/{batchId}/readings/export', 'get'],
      ['/v1/recipes', 'get'],
      ['/v1/recipes/{recipeId}', 'get'],
      ['/v1/recipes/{recipeId}/batches', 'get'],
      ['/v1/dashboard/summary', 'get'],
      ['/v1/settings', 'get'],
      ['/ping', 'get'],
      ['/health', 'get'],
    ];

    it('documents 403 on every refused operation', () => {
      for (const [path, method] of REFUSED) {
        expect({
          [`${method.toUpperCase()} ${path} carries the demo 403`]: has403(
            path,
            method,
          ),
        }).toEqual({
          [`${method.toUpperCase()} ${path} carries the demo 403`]: true,
        });
      }
    });

    it('describes the 403 as demo-only with the read-only body shape', () => {
      const response = op('/v1/pico-units', 'post').responses['403'];
      expect(response.description).toContain('demo deployments');
      expect(response.description).toContain('NODE_ENV=demo');
      const props = response.content['application/json'].schema.properties;
      expect(props.statusCode.example).toBe(403);
      expect(props.error.example).toBe('Forbidden');
      expect(props.message.example).toBe(READONLY_FORBIDDEN_MESSAGE);
    });

    it('documents no 403 on any allowed operation', () => {
      for (const [path, method] of ALLOWED) {
        expect({
          [`${method.toUpperCase()} ${path} carries no demo 403`]: has403(
            path,
            method,
          ),
        }).toEqual({
          [`${method.toUpperCase()} ${path} carries no demo 403`]: false,
        });
      }
    });

    it('carries the x-demo-readonly extension on exactly the two marked operations', () => {
      expect(op('/v1/pico-units/announce', 'post')['x-demo-readonly']).toBe(
        'exempt',
      );
      expect(
        op('/v1/pico-units/{picoUnitId}/ping', 'get')['x-demo-readonly'],
      ).toBe('refused');

      // The extension never appears on the method-default operations.
      expect(op('/v1/batches', 'post')['x-demo-readonly']).toBeUndefined();
      expect(
        op('/v1/pico-units/{picoUnitId}/readings', 'get')['x-demo-readonly'],
      ).toBeUndefined();
    });

    it('documents 403 on every non-safe operation except the exempt announcement', () => {
      const NON_SAFE = ['put', 'post', 'patch', 'delete'];
      for (const [pathKey, pathItem] of Object.entries(doc.paths)) {
        for (const method of NON_SAFE) {
          const operation = pathItem[method];
          if (!operation) continue;
          const exempt = operation['x-demo-readonly'] === 'exempt';
          expect({
            [`${method.toUpperCase()} ${pathKey} 403 matches exemption`]:
              has403(pathKey, method) === !exempt,
          }).toEqual({
            [`${method.toUpperCase()} ${pathKey} 403 matches exemption`]: true,
          });
        }
      }
    });
  });
});
