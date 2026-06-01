/**
 * Unfurl controller unit tests.
 *
 * Validates SSRF protections: isPrivateIp blocks private/reserved ranges,
 * isValidUnfurlUrl resolves DNS and rejects private addresses.
 * DNS is mocked -- no network access required.
 */

import { describe, expect, mock, test } from 'bun:test';

const mockResolve4 = mock<(hostname: string) => Promise<string[]>>();
const mockResolve6 = mock<(hostname: string) => Promise<string[]>>();

mock.module('node:dns', () => ({
  promises: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { debug: mock(), warn: mock(), error: mock(), info: mock() },
}));

import { isPrivateIp, isValidUnfurlUrl } from './controller';

// ---------------------------------------------------------------------------
// isPrivateIp
// ---------------------------------------------------------------------------

describe('isPrivateIp', () => {
  const privateCases: [string, string][] = [
    ['127.0.0.1', 'loopback literal'],
    ['127.0.0.2', 'loopback /8 range'],
    ['127.255.255.255', 'loopback /8 high end'],
    ['0.0.0.0', 'zero address'],
    ['0.1.2.3', 'zero /8 range'],
    ['10.0.0.1', 'RFC1918 class A'],
    ['10.255.255.255', 'RFC1918 class A high'],
    ['172.16.0.1', 'RFC1918 class B low'],
    ['172.31.255.255', 'RFC1918 class B high'],
    ['192.168.0.1', 'RFC1918 class C'],
    ['192.168.255.255', 'RFC1918 class C high'],
    ['169.254.0.1', 'link-local'],
    ['169.254.169.254', 'cloud metadata'],
    ['localhost', 'localhost hostname'],
    ['[::1]', 'IPv6 loopback bracketed'],
    ['::1', 'IPv6 loopback bare'],
    ['fc00::1', 'IPv6 ULA fc00'],
    ['fd12::1', 'IPv6 ULA fd prefix'],
    ['fe80::1', 'IPv6 link-local'],
    ['[fc00::1]', 'IPv6 ULA bracketed'],
    ['[fe80::1]', 'IPv6 link-local bracketed'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped RFC1918'],
    ['::ffff:192.168.1.1', 'IPv4-mapped RFC1918 class C'],
    ['::ffff:169.254.169.254', 'IPv4-mapped cloud metadata'],
    ['metadata.google.internal', 'GCP metadata hostname'],
    ['metadata.goog', 'GCP metadata short hostname'],
  ];

  for (const [input, label] of privateCases) {
    test(`blocks ${label}: ${input}`, () => {
      expect(isPrivateIp(input)).toBe(true);
    });
  }

  const publicCases: [string, string][] = [
    ['8.8.8.8', 'public DNS'],
    ['1.1.1.1', 'Cloudflare DNS'],
    ['203.0.113.1', 'TEST-NET-3'],
    ['172.32.0.1', 'just above RFC1918 class B'],
    ['172.15.255.255', 'just below RFC1918 class B'],
    ['192.169.0.1', 'just above 192.168.x.x'],
    ['example.com', 'public hostname'],
    ['2607:f8b0:4004:800::200e', 'public IPv6'],
  ];

  for (const [input, label] of publicCases) {
    test(`allows ${label}: ${input}`, () => {
      expect(isPrivateIp(input)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// isValidUnfurlUrl (async -- DNS-resolving)
// ---------------------------------------------------------------------------

describe('isValidUnfurlUrl', () => {
  test('rejects non-http protocols', async () => {
    expect(await isValidUnfurlUrl('ftp://example.com')).toBeNull();
    expect(await isValidUnfurlUrl('javascript:alert(1)')).toBeNull();
  });

  test('rejects hostnames without a dot', async () => {
    expect(await isValidUnfurlUrl('http://intranet')).toBeNull();
  });

  test('rejects when hostname is a private literal', async () => {
    expect(await isValidUnfurlUrl('http://127.0.0.1/')).toBeNull();
    expect(await isValidUnfurlUrl('http://[::1]/')).toBeNull();
    expect(await isValidUnfurlUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
  });

  test('rejects when DNS resolves to a private IPv4', async () => {
    mockResolve4.mockResolvedValueOnce(['10.0.0.5']);
    mockResolve6.mockRejectedValueOnce(new Error('ENODATA'));
    expect(await isValidUnfurlUrl('https://evil.example.com/page')).toBeNull();
  });

  test('rejects when DNS resolves to a private IPv6', async () => {
    mockResolve4.mockRejectedValueOnce(new Error('ENODATA'));
    mockResolve6.mockResolvedValueOnce(['fc00::1']);
    expect(await isValidUnfurlUrl('https://evil.example.com/page')).toBeNull();
  });

  test('rejects when any resolved IP is private (mixed)', async () => {
    mockResolve4.mockResolvedValueOnce(['93.184.216.34', '192.168.1.1']);
    mockResolve6.mockRejectedValueOnce(new Error('ENODATA'));
    expect(await isValidUnfurlUrl('https://evil.example.com/page')).toBeNull();
  });

  test('rejects when zero addresses resolve', async () => {
    mockResolve4.mockRejectedValueOnce(new Error('ENOTFOUND'));
    mockResolve6.mockRejectedValueOnce(new Error('ENOTFOUND'));
    expect(await isValidUnfurlUrl('https://nonexistent.example.com/')).toBeNull();
  });

  test('accepts valid public URL with public IPs', async () => {
    mockResolve4.mockResolvedValueOnce(['93.184.216.34']);
    mockResolve6.mockResolvedValueOnce(['2606:2800:220:1:248:1893:25c8:1946']);
    const result = await isValidUnfurlUrl('https://example.com/page');
    expect(result).not.toBeNull();
    expect(result!.hostname).toBe('example.com');
  });

  test('accepts when only v4 resolves publicly', async () => {
    mockResolve4.mockResolvedValueOnce(['93.184.216.34']);
    mockResolve6.mockRejectedValueOnce(new Error('ENODATA'));
    const result = await isValidUnfurlUrl('https://example.com/page');
    expect(result).not.toBeNull();
  });
});
