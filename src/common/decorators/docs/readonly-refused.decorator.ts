import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

import {
  READONLY_MARK,
  READONLY_SPEC_EXTENSION,
} from 'src/common/constants/readonly.constants';

/**
 * Marks a safe-method handler (`GET`/`HEAD`/`OPTIONS`) that nevertheless
 * writes persisted data, so the demo read-only guard refuses it with 403
 * and the OpenAPI document gains the demo 403 response for its operation.
 *
 * Every handler that mutates state under a safe method must carry this mark
 * — the method default alone cannot see it. Composite on purpose: the
 * `SetMetadata` key drives the runtime guard, the `x-demo-readonly`
 * extension drives the spec injection, and the two can never drift.
 */
export function ReadOnlyRefused() {
  return applyDecorators(
    SetMetadata(READONLY_MARK, 'refused'),
    ApiExtension(READONLY_SPEC_EXTENSION, 'refused'),
  );
}
