import { OpenAPIObject } from '@nestjs/swagger';

/**
 * Tags used to exclude endpoints from global error response injection.
 * When an endpoint's `@ApiTags()` includes one of these values, the
 * corresponding global error schema is skipped for that endpoint.
 * Example: monitoring endpoints tag themselves `no-validation` because
 * they don't go through the global ValidationPipe.
 */
export type OverrideTags = 'no-validation' | 'no-internal' | 'no-secret';
export type ErrorResponseAdder = (document: OpenAPIObject) => void;
