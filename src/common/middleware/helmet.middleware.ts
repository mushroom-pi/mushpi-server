import helmet from 'helmet';

/**
 * Shared Helmet security-headers middleware, used by `main.ts` and the e2e
 * fixture so tests exercise the exact production header set.
 *
 * `httpsEnabled` (from `APP_HTTPS_ENABLED`, see `config.schema.ts`) declares that the
 * browser-facing deployment is reached over HTTPS. It gates the two headers that are
 * only correct on an HTTPS origin:
 *
 * - `hsts`: Strict-Transport-Security is emitted only when the flag is on (with
 *   Helmet's defaults otherwise).
 * - `upgrade-insecure-requests`: when off it MUST be set to `null` explicitly —
 *   Helmet re-applies its default directives for any key omitted from the object,
 *   so simply leaving it out would bring the directive back. On a plain-HTTP
 *   deployment the directive breaks the SPA and Swagger: browsers rewrite
 *   `/assets/*` subresource URLs to `https://` with no fallback (and `localhost`
 *   is exempt as a potentially trustworthy origin, which masks the bug in dev).
 *   When the flag is on the directive stays, preserving the mixed-content
 *   safety net for genuinely HTTPS deployments.
 *
 * Everything else keeps Helmet's defaults, plus the customized `img-src` (blob: +
 * https:) required by hotlinked recipe images and object-URL previews — see
 * REFERENCE.md §Image Uploads & Static Serving.
 */
export function createHelmetMiddleware(httpsEnabled: boolean) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'upgrade-insecure-requests': httpsEnabled ? [] : null,
      },
    },
    hsts: httpsEnabled,
  });
}
