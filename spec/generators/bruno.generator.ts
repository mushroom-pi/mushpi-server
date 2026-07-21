// Load .env so PORT / APP_PORT / APP_HOST are available (matches NestJS ConfigService)
import 'dotenv/config';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface OpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
}

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  schema?: unknown;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toBrunoUrl(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

(async () => {
  try {
    const specPath = resolve(process.cwd(), 'spec', 'openapi.json');
    const doc: OpenApiDoc = JSON.parse(readFileSync(specPath, 'utf-8'));

    const brunoDir = resolve(process.cwd(), 'spec', 'bruno');

    // Wipe and recreate bruno directory
    rmSync(brunoDir, { recursive: true, force: true });
    mkdirSync(brunoDir, { recursive: true });

    // Write collection config
    writeFileSync(
      resolve(brunoDir, 'bruno.json'),
      JSON.stringify(
        {
          version: '1',
          name: 'MushPi Server API',
          type: 'collection',
          ignore: ['node_modules', '.git'],
        },
        null,
        2,
      ) + '\n',
    );

    // Create default environment
    const envDir = resolve(brunoDir, 'environments');
    mkdirSync(envDir, { recursive: true });

    const host = process.env.APP_HOST || 'localhost';
    const port = process.env.APP_PORT || process.env.PORT || '3000';
    const protocol = host.includes('://') ? '' : 'http://';
    const baseUrl = `${protocol}${host}:${port}`;

    writeFileSync(
      resolve(envDir, 'mushpi-server LOCAL.bru'),
      ['vars {', `  baseUrl: ${baseUrl}`, '  token:', '}', ''].join('\n'),
    );

    // Track filenames per tag directory to handle collisions
    const usedNames: Record<string, Set<string>> = {};

    // Global sequence counter
    let seq = 1;

    // Iterate paths in stable (sorted) order
    const sortedPaths = Object.keys(doc.paths).sort();

    for (const path of sortedPaths) {
      const methods = doc.paths[path];
      const sortedMethods = Object.keys(methods).sort();

      for (const method of sortedMethods) {
        const operation = methods[method];

        // Determine tag
        const tag = operation.tags?.[0] || 'misc';
        const tagSlug = slugify(tag);

        // Create tag directory
        const tagDir = resolve(brunoDir, tagSlug);
        mkdirSync(tagDir, { recursive: true });

        if (!usedNames[tagSlug]) {
          usedNames[tagSlug] = new Set();
        }

        // Determine filename
        let baseName: string;
        if (operation.operationId) {
          baseName = slugify(operation.operationId);
        } else if (operation.summary) {
          baseName = slugify(operation.summary);
        } else {
          const pathSegments = path
            .replace(/^\//, '')
            .replace(/\//g, '-')
            .replace(/\{[^}]+\}/g, 'param');
          baseName = slugify(`${method}-${pathSegments}`);
        }

        // Handle collision
        let fileName = baseName;
        let counter = 1;
        while (usedNames[tagSlug].has(fileName)) {
          fileName = `${baseName}-${counter}`;
          counter++;
        }
        usedNames[tagSlug].add(fileName);

        // Determine display name
        const displayName =
          operation.summary ||
          operation.operationId ||
          `${method.toUpperCase()} ${path}`;

        // Determine body type
        const hasBody = !!operation.requestBody;

        // Build URL with path params converted
        const url = toBrunoUrl(path);

        // Collect query parameters
        const queryParams = (operation.parameters || []).filter(
          (p) => p.in === 'query',
        );

        // Build .bru content
        const lines: string[] = [];

        lines.push('meta {');
        lines.push(`  name: ${displayName}`);
        lines.push('  type: http');
        lines.push(`  seq: ${seq}`);
        lines.push('}');
        lines.push('');

        lines.push(`${method} {`);
        lines.push(`  url: {{baseUrl}}${url}`);
        lines.push(`  body: ${hasBody ? 'json' : 'none'}`);
        lines.push('  auth: inherit');
        lines.push('}');
        lines.push('');

        lines.push('headers {');
        lines.push('  Content-Type: application/json');
        lines.push('}');

        if (queryParams.length > 0) {
          lines.push('');
          lines.push('query {');
          for (const qp of queryParams) {
            // Bruno: ~prefix on name = disabled/enabled toggle;
            // non-required params default to disabled so they're visible
            // in the UI but not sent by default.
            const prefix = qp.required ? '' : '~';
            lines.push(`  ${prefix}${qp.name}:`);
          }
          lines.push('}');
        }

        if (hasBody) {
          lines.push('');
          lines.push('body:json {');
          lines.push('  {');
          lines.push('    ');
          lines.push('  }');
          lines.push('}');
        }

        lines.push('');

        writeFileSync(resolve(tagDir, `${fileName}.bru`), lines.join('\n'));

        seq++;
      }
    }

    const totalOps = seq - 1;
    console.log(
      `✅ Bruno collection generated: ${totalOps} operations in spec/bruno/`,
    );
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to generate Bruno collection:', err);
    process.exit(1);
  }
})();
