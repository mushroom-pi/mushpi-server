import { INestApplication } from '@nestjs/common';

import { SwaggerModule } from '../src/modules/swagger/swagger.module';
import { closeTestApp, createTestApp } from './test-setup';

/**
 * Regression guard: asserts that every entity / DTO consumed by the
 * auto-generated client carries the expected @ApiProperty / @ApiPropertyOptional
 * decorators. A missing decorator silently drops the field from the committed
 * spec/openapi.json, which breaks the client's tsc build.
 *
 * Read-only — no DB writes.
 */
describe('OpenAPI schemas (e2e)', () => {
  let app: INestApplication;

  let doc: any;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    const swagger = app.get(SwaggerModule);
    doc = swagger.buildOpenApiDocument(app, undefined, {
      appendEnvSuffix: false,
    });
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  const schemas = () => doc.components.schemas;

  describe('Path-level contract', () => {
    it('does not expose /metrics (Prometheus endpoint removed)', () => {
      expect(doc.paths).not.toHaveProperty('/metrics');
    });
  });

  describe('Recipe', () => {
    it('contains all expected properties', () => {
      const props = schemas().Recipe.properties;
      for (const key of [
        'id',
        'name',
        'species',
        'temperature_target',
        'humidity_target',
        'duration_days',
        'notes',
        'created_at',
        'updated_at',
      ]) {
        expect(props).toHaveProperty(key);
      }
    });

    it('has correct types for name and temperature_target', () => {
      const props = schemas().Recipe.properties;
      expect(props.name.type).toBe('string');
      expect(props.temperature_target.type).toBe('integer');
    });
  });

  describe('Batch', () => {
    it('contains all expected properties', () => {
      const props = schemas().Batch.properties;
      for (const key of [
        'id',
        'start_at',
        'finish_at',
        'species',
        'temperature_target',
        'humidity_target',
        'notes',
        'description',
        'pico_unit_id',
        'pico_unit',
        'recipe',
      ]) {
        expect(props).toHaveProperty(key);
      }
    });

    it('pico_unit resolves to PicoUnit via $ref', () => {
      const picoUnit = schemas().Batch.properties.pico_unit;
      expect(picoUnit.allOf[0].$ref).toMatch(/PicoUnit$/);
    });
  });

  describe('PicoUnit', () => {
    it('contains all expected properties', () => {
      const props = schemas().PicoUnit.properties;
      for (const key of [
        'id',
        'created_at',
        'handle',
        'name',
        'description',
        'face_color',
        'ip',
        'mac',
        'port',
        'monitored',
        'last_seen',
        'micropython_version',
        'firmware_version',
        'api_version',
        'api_compatibility',
        'board',
        'board_total_mem_byte',
        'board_total_fs_byte',
        'board_cpu_freq_mhz',
      ]) {
        expect(props).toHaveProperty(key);
      }
    });

    it('exposes api_compatibility as a REQUIRED enum with all three verdict values', () => {
      const props = schemas().PicoUnit.properties;
      expect(props.api_compatibility.enum).toEqual([
        'compatible',
        'incompatible',
        'unknown',
      ]);
      // Required + non-nullable: every serialized PicoUnit carries the verdict.
      expect(schemas().PicoUnit.required).toContain('api_compatibility');
      expect(props.api_compatibility.nullable).toBeUndefined();
    });
  });

  describe('DashboardUnitItemDto', () => {
    it('exposes api_compatibility as a REQUIRED enum with all three verdict values', () => {
      const props = schemas().DashboardUnitItemDto.properties;
      expect(props).toHaveProperty('api_compatibility');
      expect(props.api_compatibility.enum).toEqual([
        'compatible',
        'incompatible',
        'unknown',
      ]);
      expect(schemas().DashboardUnitItemDto.required).toContain(
        'api_compatibility',
      );
    });
  });

  describe('Readings', () => {
    it('contains all expected properties', () => {
      const props = schemas().Readings.properties;
      for (const key of [
        'temperature',
        'humidity',
        'temperature_set',
        'humidity_set',
        'control_loop_enabled',
        'fan_on',
        'humidifier_on',
        'heater_on',
        'board_temp',
        'board_uptime_s',
        'board_used_mem',
        'board_used_fs',
        'time_to_response_ms',
      ]) {
        expect(props).toHaveProperty(key);
      }
    });
  });

  describe('ChangeSetupDto', () => {
    it('has a pins property', () => {
      const props = schemas().ChangeSetupDto.properties;
      expect(props).toHaveProperty('pins');
    });
  });

  describe('DevicePinsDto', () => {
    it('contains all expected properties', () => {
      const props = schemas().DevicePinsDto.properties;
      for (const key of ['dht', 'humidifier', 'fan', 'heater']) {
        expect(props).toHaveProperty(key);
      }
    });
  });
});
