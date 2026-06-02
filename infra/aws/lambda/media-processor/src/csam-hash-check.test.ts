import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const mockDynamoSend = mock(() => Promise.resolve({ Item: undefined }));

mock.module('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = mockDynamoSend;
  },
  GetItemCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { checkNcmecHashes, checkArachnidShield } from './csam-hash-check';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

afterAll(() => mock.restore());

const TABLE = 'test-ncmec-hashes';
const TEST_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function expectedMd5(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

function expectedSha1(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}

async function createTestImage(): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 64, b: 32 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

describe('checkNcmecHashes', () => {
  const dynamodb = new DynamoDBClient({});

  beforeEach(() => {
    mockDynamoSend.mockReset();
    mockDynamoSend.mockResolvedValue({ Item: undefined });
  });

  test('returns empty array when no hashes match', async () => {
    const result = await checkNcmecHashes(TEST_BYTES, TABLE, dynamodb);
    expect(result).toEqual([]);
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
  });

  test('returns MD5 match and short-circuits (skips SHA1 lookup)', async () => {
    const md5 = expectedMd5(TEST_BYTES);
    mockDynamoSend.mockImplementation((cmd: unknown) => {
      const input = (cmd as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const key = input.Key as Record<string, { S: string }>;
      if (key.hashType.S === 'MD5') {
        return Promise.resolve({
          Item: {
            hashValue: { S: md5 },
            hashType: { S: 'MD5' },
            ncmecEntryId: { S: 'entry-123' },
            source: { S: 'ncmec_industry' },
          },
        });
      }
      return Promise.resolve({ Item: undefined });
    });

    const result = await checkNcmecHashes(TEST_BYTES, TABLE, dynamodb);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'ncmec',
      hashType: 'MD5',
      matchedHash: md5,
      matchType: 'exact',
      classification: 'csam',
      matchDetails: { ncmecEntryId: 'entry-123', ncmecSource: 'ncmec_industry' },
    });
    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
  });

  test('falls through to SHA1 match when MD5 misses', async () => {
    const sha1 = expectedSha1(TEST_BYTES);
    mockDynamoSend.mockImplementation((cmd: unknown) => {
      const input = (cmd as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const key = input.Key as Record<string, { S: string }>;
      if (key.hashType.S === 'SHA1') {
        return Promise.resolve({
          Item: {
            hashValue: { S: sha1 },
            hashType: { S: 'SHA1' },
            ncmecEntryId: { S: 'entry-456' },
            source: { S: 'ncmec_ngo' },
          },
        });
      }
      return Promise.resolve({ Item: undefined });
    });

    const result = await checkNcmecHashes(TEST_BYTES, TABLE, dynamodb);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'ncmec',
      hashType: 'SHA1',
      matchedHash: sha1,
      matchType: 'exact',
      classification: 'csam',
    });
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
  });

  test('computes correct hash values and sends to correct table', async () => {
    const md5 = expectedMd5(TEST_BYTES);
    const sha1 = expectedSha1(TEST_BYTES);

    await checkNcmecHashes(TEST_BYTES, TABLE, dynamodb);

    const calls = mockDynamoSend.mock.calls;
    const md5Call = calls[0]![0] as unknown as { input: { Key: Record<string, { S: string }>; TableName: string } };
    const sha1Call = calls[1]![0] as unknown as { input: { Key: Record<string, { S: string }>; TableName: string } };

    expect(md5Call.input.TableName).toBe(TABLE);
    expect(md5Call.input.Key.hashValue.S).toBe(md5);
    expect(md5Call.input.Key.hashType.S).toBe('MD5');

    expect(sha1Call.input.TableName).toBe(TABLE);
    expect(sha1Call.input.Key.hashValue.S).toBe(sha1);
    expect(sha1Call.input.Key.hashType.S).toBe('SHA1');
  });

  test('handles missing ncmecEntryId/source gracefully', async () => {
    const md5 = expectedMd5(TEST_BYTES);
    mockDynamoSend.mockImplementation((cmd: unknown) => {
      const input = (cmd as { input: Record<string, unknown> }).input as Record<string, unknown>;
      const key = input.Key as Record<string, { S: string }>;
      if (key.hashType.S === 'MD5') {
        return Promise.resolve({ Item: { hashValue: { S: md5 }, hashType: { S: 'MD5' } } });
      }
      return Promise.resolve({ Item: undefined });
    });

    const result = await checkNcmecHashes(TEST_BYTES, TABLE, dynamodb);
    expect(result).toHaveLength(1);
    expect(result[0]!.matchDetails).toEqual({
      ncmecEntryId: undefined,
      ncmecSource: undefined,
    });
  });

  test('propagates DynamoDB errors', async () => {
    mockDynamoSend.mockRejectedValue(new Error('Throttled'));
    await expect(checkNcmecHashes(TEST_BYTES, TABLE, dynamodb)).rejects.toThrow('Throttled');
  });
});

describe('checkArachnidShield', () => {
  const credentials = { username: 'testuser', password: 'testpass' };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns csam match with correct fields', async () => {
    const mockFetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      const hashes = JSON.parse(init?.body as string) as string[];
      const hash = hashes[0]!;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            scanned_hashes: {
              [hash]: {
                classification: 'csam',
                match_type: 'near',
                near_match_details: {
                  sha1_base32: 'ABC123',
                  classification: 'csam',
                  timestamp: 1234567890,
                },
              },
            },
          }),
          { status: 200 }
        )
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    const result = await checkArachnidShield(img, credentials);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'arachnid_shield',
      hashType: 'PDQ',
      matchType: 'near',
      classification: 'csam',
    });
    expect(result[0]!.matchDetails).toMatchObject({ sha1_base32: 'ABC123' });
  });

  test('returns empty array when classification is not csam', async () => {
    const mockFetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      const hashes = JSON.parse(init?.body as string) as string[];
      const hash = hashes[0]!;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            scanned_hashes: { [hash]: { classification: 'not_csam' } },
          }),
          { status: 200 }
        )
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    const result = await checkArachnidShield(img, credentials);
    expect(result).toEqual([]);
  });

  test('returns empty array when scanned hash has no entry', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ scanned_hashes: {} }), { status: 200 })
      )
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    const result = await checkArachnidShield(img, credentials);
    expect(result).toEqual([]);
  });

  test('sends correct Authorization header (Basic auth)', async () => {
    let capturedHeaders: Headers | undefined;
    const mockFetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response(JSON.stringify({ scanned_hashes: {} }), { status: 200 })
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    await checkArachnidShield(img, credentials);

    const expectedAuth = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');
    expect(capturedHeaders?.get('Authorization')).toBe(expectedAuth);
  });

  test('sends only hash data -- never raw image bytes', async () => {
    let capturedBody: string | undefined;
    const mockFetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return Promise.resolve(
        new Response(JSON.stringify({ scanned_hashes: {} }), { status: 200 })
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    await checkArachnidShield(img, credentials);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!) as string[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const decoded = Buffer.from(parsed[0]!, 'base64');
    expect(decoded.length).toBe(32);
    expect(capturedBody!.length).toBeLessThan(200);
  });

  test('posts to correct API endpoint', async () => {
    let capturedUrl: string | undefined;
    const mockFetch = mock((url: string | URL | Request, _init?: RequestInit) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        new Response(JSON.stringify({ scanned_hashes: {} }), { status: 200 })
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    await checkArachnidShield(img, credentials);

    expect(capturedUrl).toBe('https://shield.projectarachnid.com/v1/pdq');
  });

  test('throws on non-200 API response', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response('Rate limited', { status: 429 }))
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    await expect(checkArachnidShield(img, credentials)).rejects.toThrow(
      'Arachnid Shield API returned 429'
    );
  });

  test('exact match type is preserved', async () => {
    const mockFetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      const hashes = JSON.parse(init?.body as string) as string[];
      const hash = hashes[0]!;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            scanned_hashes: {
              [hash]: { classification: 'csam', match_type: 'exact' },
            },
          }),
          { status: 200 }
        )
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    const result = await checkArachnidShield(img, credentials);

    expect(result).toHaveLength(1);
    expect(result[0]!.matchType).toBe('exact');
  });

  test('PDQ hash is deterministic for same input', async () => {
    const hashes: string[] = [];
    const mockFetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(init?.body as string) as string[];
      hashes.push(parsed[0]!);
      return Promise.resolve(
        new Response(JSON.stringify({ scanned_hashes: {} }), { status: 200 })
      );
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const img = await createTestImage();
    await checkArachnidShield(img, credentials);
    await checkArachnidShield(img, credentials);

    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toBe(hashes[1]);
  });
});
