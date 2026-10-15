import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

import {
  DEMO_READONLY_MARK,
  DEMO_READONLY_SPEC_EXTENSION,
} from 'src/common/constants/demo-readonly.constants';

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
export function DemoReadOnlyRefused() {
  return applyDecorators(
    SetMetadata(DEMO_READONLY_MARK, 'refused'),
    ApiExtension(DEMO_READONLY_SPEC_EXTENSION, 'refused'),
  );
}
