/**
 * Rate-limiter identity constants.
 *
 * Deliberately free of numbers: the limit values and window lengths arrive
 * ONLY from the deployment (the `VISITOR_*`, `ABUSE_*` and `GLOBAL_*` limiter
 * pairs, required-when-demo in the config schema). It does carry the one
 * visitor-facing sentence a demo boot sends with a 429 — the slow-down
 * wording below — because the dashboard holds no demo-specific copy. Every
 * boot outside demo keeps the historical `message: 'Too many requests'` body
 * byte-for-byte.
 *
 * The throttler names are load-bearing in two places: they key the
 * `@SkipThrottle` metadata (health and announce carry skips by name) and
 * they become header suffixes (`X-RateLimit-*-demo-global`,
 * `Retry-After-demo-abuse`). Renaming either constant changes both the skip
 * marks and the wire headers — keep them in lockstep with REFERENCE.md
 * §Guards.
 */

/** Throttler name of the named backstop definition (whole-instance flood). */
export const RATE_LIMIT_GLOBAL_THROTTLER_NAME = 'demo-global';

/** Throttler name of the named abuse definition (refused changes only). */
export const RATE_LIMIT_ABUSE_THROTTLER_NAME = 'demo-abuse';

/**
 * The backstop's tracker key: a single constant identity for ALL visitors,
 * which is what makes it an instance-wide bucket instead of a per-visitor
 * one. The abuse bucket stays distinct because its key embeds the
 * throttler NAME, and it is tracked by the visitor's own forwarded identity.
 */
export const RATE_LIMIT_GLOBAL_TRACKER = 'global';

/**
 * The visitor-facing slow-down sentence a demo boot sends with a 429. The
 * `{seconds}` figure is filled by `formatSlowDownMessage` with the blocking
 * bucket's real remaining block window — never a fixed number. This template
 * is the sole place the maintainer approves or edits the wording.
 */
export const RATE_LIMIT_SLOW_DOWN_MESSAGE_TEMPLATE =
  'You are going too fast for this demo. Please wait about {seconds} seconds before trying again.';

/** Fill the slow-down template with the actual wait, in the library's own seconds. */
export function formatSlowDownMessage(seconds: number): string {
  return RATE_LIMIT_SLOW_DOWN_MESSAGE_TEMPLATE.replace(
    '{seconds}',
    String(seconds),
  );
}
