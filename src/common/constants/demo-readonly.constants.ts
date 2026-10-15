/**
 * Demo read-only guard contract.
 *
 * A demo deployment (`NODE_ENV=demo`) is internet-exposed and read-only for
 * visitors: every non-safe-method request is refused with 403 unless its
 * handler carries `@DemoReadOnlyExempt()`. A safe-method handler that
 * nevertheless writes data carries `@DemoReadOnlyRefused()` and is refused
 * too. The same declaration drives both the runtime guard (via `SetMetadata`)
 * and the OpenAPI document's `403` injection (via the `x-demo-readonly`
 * extension), so a refused operation can never exist without documented 403s.
 */

/** Reflector metadata key written by the mark decorators, read by the guard. */
export const DEMO_READONLY_MARK = 'DEMO_READONLY_MARK';

/** The mark written on a handler: `'exempt'` or `'refused'`. */
export type DemoReadOnlyMark = 'exempt' | 'refused';

/** Value carried by the `x-demo-readonly` OpenAPI extension on marked operations. */
export type DemoReadOnlySpecMark = DemoReadOnlyMark;

/**
 * HTTP methods that are safe for visitors: a request using one of these is
 * allowed by default unless its handler carries `@DemoReadOnlyRefused()`
 * (a documented safe-method exception: the handler writes persisted state).
 */
export const DEMO_READONLY_SAFE_METHODS: ReadonlyArray<
  'GET' | 'HEAD' | 'OPTIONS'
> = ['GET', 'HEAD', 'OPTIONS'];

/**
 * OpenAPI operation-level extension key written by both mark decorators.
 * The spec generator reads it to decide 403 injection; its presence marks
 * the two explicitly-judged operations for audit.
 */
export const DEMO_READONLY_SPEC_EXTENSION = 'x-demo-readonly';

/** Response body `message` for every demo refusal. */
export const DEMO_READONLY_FORBIDDEN_MESSAGE =
  'This demo deployment is read-only. Nothing was changed.';

/** OpenAPI `403` response description — demo-only, self-hosted hubs never return it. */
export const DEMO_READONLY_FORBIDDEN_DESCRIPTION =
  'Returned only on demo deployments (NODE_ENV=demo), which are read-only: this data-changing operation is refused and nothing changes. Self-hosted hubs never return it.';
