/**
 * Refusal message for externally-originated Pico announcements on a demo
 * boot. A demo deployment has no physical units — its only legitimate
 * announcer is the simulated unit beside the server — so an announcement
 * arriving through a proxy (or from any external address) is not hardware
 * traffic and is refused outright, before the secret is compared.
 *
 * Deliberately distinct from the read-only refusal message
 * (`DEMO_READONLY_FORBIDDEN_MESSAGE`): this endpoint is not refusing a
 * change, it is refusing an origin.
 */
export const PICO_ANNOUNCE_REFUSED_MESSAGE =
  'This deployment accepts Pico announcements from the server network only.';
