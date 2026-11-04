import { Request } from 'express';
import * as net from 'net';
import * as os from 'os';

/**
 * Is this request from an INTERNAL caller — a process beside the server —
 * rather than traffic that arrived through the demo's reverse proxy?
 *
 * The demo deployment has no physical Pico units; its only legitimate
 * announcer is the simulated unit calling the server directly (no proxy, no
 * `X-Forwarded-For`, loopback or same-subnet peer). Everything else that
 * reaches the announce endpoint is external traffic and gets refused before
 * the secret is even compared.
 *
 * A request is internal ⇔ BOTH hold:
 *
 * (a) it carries NO non-empty `X-Forwarded-For` header, AND
 * (b) its remote identity — `req.ip`, which with no forwarded header under
 *     the demo's single-hop trust proxy is the socket peer — is loopback
 *     (`127.0.0.0/8`, `::1`) or inside the CIDR of one of the server's own
 *     network interfaces as reported by `os.networkInterfaces()` at call
 *     time (`internal: true` entries included).
 *
 * Why (a) stays even though (b) is address-based: under `trust proxy = 1` a
 * direct attacker CAN forge `X-Forwarded-For: 127.0.0.1` and make `req.ip`
 * read as loopback. Requiring the header to be ABSENT means forgery can
 * only ever buy a 403.
 *
 * Everything else is a visitor and is refused. The predicate FAILS CLOSED:
 * an absent, empty, or unparseable address is never internal, and an
 * interface entry without a resolvable CIDR declares no subnet to be inside
 * of. `interfaces` is a parameter (defaulting to the live `os.networkInterfaces()`)
 * so the rule is testable against fixture dicts without touching real
 * hardware state.
 *
 * RESIDUAL ASSUMPTION the code cannot verify: the demo's reverse proxy must
 * present the visitor identity in `X-Forwarded-For`. If a proxy is ever
 * configured to strip it, visitor traffic arrives header-less from the
 * proxy's own address — which sits inside one of the server's subnets — and
 * is classified internal. Deployment topology is then the only thing keeping
 * the gate shut.
 */
export function isInternalCaller(
  req: Request,
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): boolean {
  if (hasForwardedHeader(req)) return false;

  const address = normalizeAddress(req.ip);
  if (address === undefined || net.isIP(address) === 0) return false;

  // Loopback is internal by definition, independent of the interface table.
  if (address === '::1') return true;
  if (net.isIPv4(address) && address.startsWith('127.')) return true;

  const matchers = ownSubnetMatchers(interfaces);
  const family = net.isIPv4(address) ? 'ipv4' : 'ipv6';
  const matcher = family === 'ipv4' ? matchers.ipv4 : matchers.ipv6;
  return matcher.check(address, family);
}

/**
 * Any non-empty forwarded header marks proxy-carried (or forged) traffic.
 * Node joins duplicate `X-Forwarded-For` headers into one comma string, but
 * express typings allow arrays — treat any non-empty entry as forwarded. An
 * explicitly empty header claims nothing, so it falls through to the
 * address rule.
 */
function hasForwardedHeader(req: Request): boolean {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.trim().length > 0;
  if (Array.isArray(forwarded)) {
    return forwarded.some((entry) => entry.trim().length > 0);
  }
  return false;
}

/**
 * trim + lowercase, then unwrap IPv4-mapped IPv6 (`::ffff:a.b.c.d` — what a
 * dual-stack socket reports for an IPv4 peer) so loopback and the IPv4
 * subnet matcher see a plain address. A mapped form whose remainder is not
 * a valid IPv4 is kept as-is and fails closed downstream.
 */
function normalizeAddress(ip?: string): string | undefined {
  if (!ip) return undefined;
  const value = String(ip).trim().toLowerCase();
  if (value.length === 0) return undefined;
  if (value.startsWith('::ffff:')) {
    const rest = value.slice('::ffff:'.length);
    if (net.isIPv4(rest)) return rest;
  }
  return value;
}

/**
 * The server's own subnets, one matcher per family. Family is passed
 * EXPLICITLY on both `addSubnet` and `check`: the constructor's `isIPv4`
 * option exists at runtime but is absent from the installed @types/node,
 * and an add-subnet of the wrong default family throws — explicitness makes
 * neither a concern. Non-canonical subnet bases (the host's own address with
 * the prefix, exactly as `os.networkInterfaces()` reports `cidr`) are
 * accepted: BlockList masks internally.
 */
function ownSubnetMatchers(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>) {
  const ipv4 = new net.BlockList();
  const ipv6 = new net.BlockList();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry.cidr) continue;
      const [base, prefix] = entry.cidr.split('/');
      const offset = Number(prefix);
      if (!Number.isInteger(offset) || offset < 0) continue;
      if (net.isIPv4(base)) {
        ipv4.addSubnet(base, offset, 'ipv4');
      } else if (net.isIPv6(base)) {
        ipv6.addSubnet(base, offset, 'ipv6');
      }
    }
  }
  return { ipv4, ipv6 };
}
