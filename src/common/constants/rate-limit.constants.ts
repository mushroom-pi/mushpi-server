/**
 * Rate-limiter identity constants.
 *
 * Deliberately free of numbers and user-facing text: the limit values and
 * window lengths arrive ONLY from the deployment (the `VISITOR_*`,
 * `ABUSE_*` and `GLOBAL_*` limiter pairs, required-when-demo in the config
 * schema), and the server's 429 response body carries just the historical
 * explicit-error shape — no wait message.
 * Labels and messages for a slowed-down visitor are the client's job.
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
