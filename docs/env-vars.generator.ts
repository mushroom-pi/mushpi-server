import * as fs from 'fs';
import * as Joi from 'joi';

import { validationSchema } from '../src/modules/config/config.schema';

function generateMarkdownFromJoi(schema: Joi.Schema): string {
  const described = schema.describe();

  let md = '# Environment Variables Documentation\n\n';
  md += '> Automatically generated from Joi validation schema\n\n';
  md += '| Variable | Type | Required | Default | Conditions | Description |\n';
  md += '|----------|------|----------|---------|------------|-------------|\n';

  if (described.type !== 'object' || !described.keys) {
    throw new Error('Expected an object schema');
  }

  for (const [key, value] of Object.entries(described.keys)) {
    md += generateRow(key, value as any);
  }

  return md;
}

function generateRow(key: string, value: any): string {
  const type = getTypeDescription(value);
  const required = getRequiredStatus(value);
  const defaultValue = getDefaultValue(value);
  const conditions = getConditions(value);
  const description = value.flags?.description || '';

  return `| \`${key}\` | ${type} | ${required} | ${defaultValue} | ${conditions} | ${description} |\n`;
}

function getTypeDescription(value: any): string {
  if (value.type) {
    let typeDesc = value.type;

    if (value.type === 'array' && value.items) {
      typeDesc += ` of ${value.items.map((i: any) => i.type).join(' or ')}`;
    }

    if (value.type === 'alternatives' && value.matches) {
      const types = value.matches.map((m: any) => m.schema.type);
      typeDesc = types.join(' or ');
    }

    return typeDesc;
  }
  return 'any';
}

function getRequiredStatus(value: any): string {
  // Direct required flag
  if (value.flags?.presence === 'required') return 'Always';
  if (value.flags?.presence === 'optional') return 'Never';

  // Check for conditional requirements
  const conditions = detectConditionalRequirements(value);
  if (conditions.length > 0) return 'Conditional';

  return 'Never';
}

function getDefaultValue(value: any): string {
  if (value.flags?.default !== undefined) {
    return `\`${JSON.stringify(value.flags.default)}\``;
  }
  return '';
}

function getConditions(value: any): string {
  const conditions: string[] = [];

  // Handle when conditions
  const conditionalReqs = detectConditionalRequirements(value);
  conditions.push(...conditionalReqs);

  // Handle other validations
  if (value.allow) {
    conditions.push(
      `Allowed values: ${value.allow.map((v: any) => `\`${v}\``).join(', ')}`,
    );
  }

  if (value.valid) {
    conditions.push(
      `Valid values: ${value.valid.map((v: any) => `\`${v}\``).join(', ')}`,
    );
  }

  if (value.rules) {
    for (const rule of value.rules) {
      if (rule.name === 'min') {
        conditions.push(`Minimum: \`${rule.args.limit}\``);
      }
      if (rule.name === 'max') {
        conditions.push(`Maximum: \`${rule.args.limit}\``);
      }
      if (rule.name === 'pattern') {
        conditions.push(`Pattern: \`${rule.args.regex}\``);
      }
    }
  }

  return conditions.join('<br>');
}

function detectConditionalRequirements(value: any): string[] {
  const conditions: string[] = [];

  if (value.rules) {
    for (const rule of value.rules) {
      if (rule.name === 'when') {
        const ref = rule.args.ref[0];
        const cases = [];

        for (const condition of rule.args.switch) {
          const conditionDesc = [];

          // Handle the "is" condition
          if (condition.is) {
            if (
              typeof condition.is === 'object' &&
              condition.is.type === 'string'
            ) {
              conditionDesc.push(`\`${ref}\` is \`${condition.is.value}\``);
            } else {
              conditionDesc.push(`\`${ref}\` is \`${condition.is}\``);
            }
          }

          // Handle the "then" case
          if (condition.then) {
            const thenDesc = describeThenCase(condition.then);
            if (thenDesc) conditionDesc.push(thenDesc);
          }

          if (conditionDesc.length > 0) {
            cases.push(conditionDesc.join(' then '));
          }
        }

        // Handle the "otherwise" case
        if (rule.args.otherwise) {
          const otherwiseDesc = describeThenCase(rule.args.otherwise);
          if (otherwiseDesc) {
            cases.push(`otherwise ${otherwiseDesc}`);
          }
        }

        if (cases.length > 0) {
          conditions.push(cases.join('; '));
        }
      }
    }
  }

  return conditions;
}

function describeThenCase(thenSchema: any): string {
  const parts = [];

  // Handle presence requirements
  if (thenSchema.flags?.presence === 'required') {
    parts.push('required');
  } else if (thenSchema.flags?.presence === 'optional') {
    parts.push('optional');
  }

  // Handle default values
  if (thenSchema.flags?.default !== undefined) {
    parts.push(`defaults to \`${JSON.stringify(thenSchema.flags.default)}\``);
  }

  // Handle type changes
  if (thenSchema.type && thenSchema.type !== 'any') {
    parts.push(`type becomes ${thenSchema.type}`);
  }

  return parts.join(', ');
}

// Generate and save the documentation
try {
  const documentation = generateMarkdownFromJoi(validationSchema);
  fs.writeFileSync('docs/ENVIRONMENT.md', documentation);
  console.log('✅ Documentation generated at ENVIRONMENT.md');
} catch (error) {
  console.error('❌ Error generating documentation:', error);
}
