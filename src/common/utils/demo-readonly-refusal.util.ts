import {
  DEMO_READONLY_SAFE_METHODS,
  DemoReadOnlyMark,
} from 'src/common/constants/demo-readonly.constants';

/**
 * The single definition of "a request the demo read-only guard would
 * refuse" — the exact decision `DemoReadOnlyGuard.canActivate` makes,
 * extracted so the demo abuse throttler's `skipIf` and the guard stay
 * semantics-locked (the same discipline as the setup duplicate-GPIO rule
 * in the root `AGENTS.md`). One definition of a refused change, two
 * consumers; a change to the refusal rule lands in both automatically.
 *
 * Pure function: the mark is read at HANDLER level by both consumers
 * (`Reflect.getMetadata` on `context.getHandler()`), never class-level, so
 * neither needs DI.
 *
 * Semantics:
 * - `exempt` mark → never a refusal (announcement is the only one).
 * - `refused` mark → refusal even under a safe method (the
 *   safe-method-writes convention).
 * - no mark → refusal iff the method is not one of the safe methods
 *   (`GET`/`HEAD`/`OPTIONS`).
 */
export function isDemoReadOnlyRefusal(
  mark: DemoReadOnlyMark | undefined,
  method: string,
): boolean {
  if (mark === 'exempt') return false;
  if (mark === 'refused') return true;
  return !DEMO_READONLY_SAFE_METHODS.includes(
    method as (typeof DEMO_READONLY_SAFE_METHODS)[number],
  );
}
