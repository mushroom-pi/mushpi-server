import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

import {
  READONLY_MARK,
  READONLY_SPEC_EXTENSION,
} from 'src/common/constants/readonly.constants';

/**
 * Marks a handler as exempt from the demo read-only guard: the request is
 * allowed on a `NODE_ENV=demo` boot regardless of method, and the OpenAPI
 * document omits the demo 403 response for its operation.
 *
 * Composite on purpose — the `SetMetadata` key is what the runtime guard
 * reads via `Reflector`, and the `x-demo-readonly` extension is what the
 * spec injection reads. The two projections of the same declaration can
 * therefore never drift: it cannot exempt one without the other.
 *
 * The exemption must stay deliberate and auditable: today only Pico
 * announcement carries it (the sole inbound writer on demo, gated by the
 * `X-Pico-Secret` header).
 */
export function ReadOnlyExempt() {
  return applyDecorators(
    SetMetadata(READONLY_MARK, 'exempt'),
    ApiExtension(READONLY_SPEC_EXTENSION, 'exempt'),
  );
}
