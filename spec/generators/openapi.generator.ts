import { NestFactory } from '@nestjs/core';

import { mkdirSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { resolve } from 'path';

import { applyApiVersioning } from 'src/common/utils/api-version';
import { applyThrowawayRuntimePaths } from 'src/common/utils/throwaway-runtime-paths';
import { AppModule } from 'src/modules/app.module';
import { SwaggerModule } from 'src/modules/swagger/swagger.module';

(async () => {
  try {
    // Spec generation must NEVER open the configured database or contact real
    // Pico units. The import above already redirected SQLITE_PATH/LOGS_PATH to
    // throwaway paths under the OS temp dir — and it had to happen at IMPORT
    // time: @nestjs/config runs Joi validation in the synchronous prefix of
    // ConfigModule.forRoot(), i.e. when src/modules/config/config.module.ts is
    // first required (before this IIFE body ever runs), and the validated
    // snapshot wins over later process.env writes. This call re-asserts the
    // guard (idempotent) for readability; the module-level sort order
    // src/common/** before src/modules/** is load-bearing — do not reorder it.
    // See REFERENCE.md §Spec Tooling Internals.
    applyThrowawayRuntimePaths();

    // Use create() (not createApplicationContext) because Swagger's scanner
    // requires an HTTP adapter to introspect controllers/routes.
    // We simply never call app.listen().
    const app = await NestFactory.create(AppModule, {
      logger: false,
    });

    applyApiVersioning(app);

    const swagger = app.get(SwaggerModule);
    const doc = swagger.buildOpenApiDocument(app as any, undefined, {
      appendEnvSuffix: false,
    });

    const specDir = resolve(process.cwd(), 'spec');
    mkdirSync(specDir, { recursive: true });

    writeFileSync(
      resolve(specDir, 'openapi.json'),
      JSON.stringify(doc, null, 2) + '\n',
    );

    writeFileSync(
      resolve(specDir, 'openapi.yaml'),
      yaml.dump(doc, { noRefs: true, lineWidth: 120 }),
    );

    await app.close();
    console.log(
      '✅ OpenAPI spec exported to spec/openapi.json and spec/openapi.yaml',
    );
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to export OpenAPI spec:', err);
    process.exit(1);
  }
})();
