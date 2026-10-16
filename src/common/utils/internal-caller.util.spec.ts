import { Request } from 'express';
import * as os from 'os';

import { isInternalCaller } from './internal-caller.util';

/**
 * The demo announce arrival classifier: internal caller (beside the server,
 * no proxy header) vs visitor (refused at the announce endpoint). The
 * interface table is injected so the rules are tested against a fixture
 * dict, never against real host state. Requests are shaped as the guard
 * sees them — `{ headers, ip }`.
 */
const iface = (
  address: string,
  cidr: string | null,
  internal = false,
): os.NetworkInterfaceInfo =>
  ({
    address,
    netmask: '255.255.255.255',
    family: 'IPv4',
    cidr,
    internal,
    mac: '00:00:00:00:00:00',
  }) as unknown as os.NetworkInterfaceInfo;

const INTERFACES: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
  lo: [
    iface('127.0.0.1', '127.0.0.1/8', true),
    {
      address: '::1',
      netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      family: 'IPv6',
      cidr: '::1/128',
      internal: true,
      mac: '',
    } as unknown as os.NetworkInterfaceInfo,
  ],
  eth0: [
    iface('192.168.1.20', '192.168.1.20/24'),
    {
      address: 'fe80::1',
      netmask: '',
      family: 'IPv6',
      cidr: 'fe80::1/64',
      internal: false,
      mac: 'aa:bb:cc:dd:ee:ff',
    } as unknown as os.NetworkInterfaceInfo,
    // an entry without a resolvable CIDR declares no subnet — skipped
    iface('10.9.0.1', null),
  ],
};

const req = (
  headers: Record<string, string | string[]>,
  ip?: string,
): Request => ({ headers, ip }) as unknown as Request;

describe('isInternalCaller', () => {
  it('treats loopback peers as internal (v4, v6 and IPv4-mapped)', () => {
    expect(isInternalCaller(req({}, '127.0.0.1'), INTERFACES)).toBe(true);
    expect(isInternalCaller(req({}, '127.255.255.254'), INTERFACES)).toBe(true);
    expect(isInternalCaller(req({}, '::1'), INTERFACES)).toBe(true);
    expect(isInternalCaller(req({}, '::ffff:127.0.0.1'), INTERFACES)).toBe(
      true,
    );
    // case and whitespace do not hide a loopback peer
    expect(isInternalCaller(req({}, ' ::FFFF:127.0.0.1 '), INTERFACES)).toBe(
      true,
    );
  });

  it("treats peers inside the server's own subnets as internal (v4 and v6)", () => {
    // the non-canonical base 192.168.1.20/24 still covers the whole /24
    expect(isInternalCaller(req({}, '192.168.1.99'), INTERFACES)).toBe(true);
    expect(isInternalCaller(req({}, '::ffff:192.168.1.7'), INTERFACES)).toBe(
      true,
    );
    expect(isInternalCaller(req({}, 'fe80::42'), INTERFACES)).toBe(true);
  });

  it('treats addresses outside the own subnets as visitors', () => {
    expect(isInternalCaller(req({}, '192.168.2.5'), INTERFACES)).toBe(false);
    expect(isInternalCaller(req({}, '::ffff:8.8.8.8'), INTERFACES)).toBe(false);
    expect(isInternalCaller(req({}, '2600::1'), INTERFACES)).toBe(false);
    // the interface whose cidr is null claims no subnet: nothing inside it
    expect(isInternalCaller(req({}, '10.9.0.5'), INTERFACES)).toBe(false);
  });

  it('refuses ANY request carrying a forwarded header — even a loopback one', () => {
    // Under trust proxy = 1 a direct attacker can forge
    // X-Forwarded-For: 127.0.0.1 and make req.ip read as loopback;
    // requiring the header to be ABSENT means forgery only buys a refusal.
    expect(
      isInternalCaller(
        req({ 'x-forwarded-for': '127.0.0.1' }, '127.0.0.1'),
        INTERFACES,
      ),
    ).toBe(false);
    expect(
      isInternalCaller(
        req({ 'x-forwarded-for': '9.9.9.9, 127.0.0.1' }, '127.0.0.1'),
        INTERFACES,
      ),
    ).toBe(false);
    expect(
      isInternalCaller(req({ 'x-forwarded-for': ['127.0.0.1'] }), INTERFACES),
    ).toBe(false);
  });

  it('an explicitly empty forwarded header claims nothing (falls to the address rule)', () => {
    expect(
      isInternalCaller(req({ 'x-forwarded-for': '' }, '127.0.0.1'), INTERFACES),
    ).toBe(true);
    expect(
      isInternalCaller(
        req({ 'x-forwarded-for': '   ' }, '8.8.4.4'),
        INTERFACES,
      ),
    ).toBe(false);
  });

  it('fails closed on absent, empty or unparseable addresses', () => {
    expect(isInternalCaller(req({}), INTERFACES)).toBe(false);
    expect(isInternalCaller(req({}, ''), INTERFACES)).toBe(false);
    expect(isInternalCaller(req({}, '   '), INTERFACES)).toBe(false);
    expect(isInternalCaller(req({}, 'not-an-ip'), INTERFACES)).toBe(false);
    expect(isInternalCaller(req({}, '127.1'), INTERFACES)).toBe(false);
    // a mapped form whose remainder is not a valid IPv4 does not slip past
    expect(isInternalCaller(req({}, '::ffff:not-an-ip'), INTERFACES)).toBe(
      false,
    );
  });

  it('an empty interface table admits only loopback', () => {
    expect(isInternalCaller(req({}, '10.0.0.1'), {})).toBe(false);
    expect(isInternalCaller(req({}, '192.168.1.5'), {})).toBe(false);
    expect(isInternalCaller(req({}, '127.0.0.1'), {})).toBe(true);
    expect(isInternalCaller(req({}, '::1'), {})).toBe(true);
  });
});
