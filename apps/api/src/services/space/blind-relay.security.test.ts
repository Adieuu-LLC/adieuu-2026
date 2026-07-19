/**
 * Blind-relay security regression for Spaces.
 *
 * The load-bearing privacy guarantee for E2EE Spaces: the server is a blind
 * relay. It must store and echo ONLY the `CipherCheck` verification challenge
 * (`knownValue`, `encryptedKnownValue`, `nonce`) and never any Cipher entropy,
 * derived keys, or cipherIds. This suite asserts that guarantee at every layer:
 *
 *  1. Request validation strips smuggled key material (no endpoint accepts it).
 *  2. The created Space's stored document carries only the challenge.
 *  3. Every public serializer echoes only the challenge (whitelist), even if a
 *     malformed document were persisted.
 *  4. The end-to-end create route neither stores nor echoes key material.
 *
 * Runs in both `test-api` and `test:security`.
 *
 * @module services/space/blind-relay.security.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';
import type { RouteContext } from '../../router/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockHasPaidAccess = mock((_ctx: any) => true) as AnyMock;

const spaceRepo = {
  findBySlug: mock(async (_slug: string) => null) as AnyMock,
  findById: mock(async (_id: ObjectId) => null) as AnyMock,
  createSpace: mock(async (input: any) => ({
    ...input,
    _id: input._id ?? new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  findByIds: mock(async (_ids: ObjectId[]) => [] as any[]) as AnyMock,
  discover: mock(async (_opts: any) => [] as any[]) as AnyMock,
};

const roleRepo = {
  createRole: mock(async (input: any) => ({
    ...input, _id: new ObjectId(), isDefaultMember: input.isDefaultMember ?? false,
    isSystem: input.isSystem ?? false, createdAt: new Date(), updatedAt: new Date(),
  })) as AnyMock,
  findBySpace: mock(async (_id: ObjectId) => [] as any[]) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const memberRepo = {
  createMember: mock(async (input: any) => ({
    ...input, _id: new ObjectId(), status: 'active', joinedAt: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
  })) as AnyMock,
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const channelRepo = {
  createChannel: mock(async (input: any) => ({
    ...input, _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date(),
  })) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../billing/resolve-access', () => ({ hasPaidAccess: mockHasPaidAccess }));
mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-channel.repository', () => ({ getSpaceChannelRepository: () => channelRepo }));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
const publishSpaceEventToIdentity = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({ publishSpaceEvent, publishSpaceEventToIdentity }));

import { createSpaceCtrl } from '../../routes/spaces/controller';
import { CreateSpaceSchema, UpdateSpaceSchema, CipherCheckSchema } from '@adieuu/shared/schemas';
import { toPublicSpace } from '../../models/space';
import { toPublicSpaceChannel } from '../../models/space-channel';
import { toPublicSpaceMessage } from '../../models/space-message';

// ---------------------------------------------------------------------------
// Key-material scanner
// ---------------------------------------------------------------------------

/**
 * Field names that must NEVER appear anywhere in a stored Space document or an
 * API response. `nonce`/`knownValue`/`encryptedKnownValue` are the allowed
 * challenge fields and are intentionally absent here.
 */
const FORBIDDEN_KEYS = new Set([
  'entropy', 'seed', 'salt',
  'key', 'keys', 'keymaterial', 'derivedkey', 'masterkey', 'privatekey',
  'encryptionkey', 'symmetrickey',
  'secret', 'secretkey', 'passphrase', 'password',
  'cipherkey',
]);

const ALLOWED_CIPHER_CHECK_KEYS = ['encryptedKnownValue', 'knownValue', 'nonce'];

/** Walks any value and returns the paths of every forbidden key it finds. */
function findKeyMaterial(value: unknown, path = '$', found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findKeyMaterial(v, `${path}[${i}]`, found));
    return found;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof ObjectId) &&
    !(value instanceof Date)
  ) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) found.push(`${path}.${k}`);
      findKeyMaterial(v, `${path}.${k}`, found);
    }
  }
  return found;
}

/** A cipher challenge as it would arrive AFTER schema validation (clean). */
const CLEAN_CIPHER_CHECK = {
  knownValue: 'kv-abc123',
  encryptedKnownValue: 'ZW5jcnlwdGVkLWtub3duLXZhbHVl',
  nonce: 'bm9uY2UtMTIz',
};

/** A hostile challenge with smuggled key material mixed in. */
const POLLUTED_CIPHER_CHECK = {
  ...CLEAN_CIPHER_CHECK,
  cipherId: new ObjectId().toHexString(),
  entropy: 'super-secret-entropy',
  derivedKey: 'derived-key-bytes',
  key: 'raw-key',
  secret: 'passphrase',
};

// ---------------------------------------------------------------------------

describe('spaces blind-relay: request validation strips key material', () => {
  test('CipherCheckSchema keeps only the three challenge fields', () => {
    const parsed = CipherCheckSchema.parse(POLLUTED_CIPHER_CHECK);
    expect(Object.keys(parsed).sort()).toEqual(ALLOWED_CIPHER_CHECK_KEYS);
    expect(findKeyMaterial(parsed)).toEqual([]);
  });

  test('CreateSpaceSchema strips top-level and nested key material', () => {
    const parsed = CreateSpaceSchema.parse({
      slug: 'secret-space',
      name: 'Secret Space',
      visibility: 'listed',
      cipherCheck: POLLUTED_CIPHER_CHECK,
      // Smuggled top-level key material:
      entropy: 'nope',
      cipherId: new ObjectId().toHexString(),
      derivedKey: 'nope',
      key: 'nope',
    } as Record<string, unknown>);

    expect(findKeyMaterial(parsed)).toEqual([]);
    expect(Object.keys(parsed.cipherCheck!).sort()).toEqual(ALLOWED_CIPHER_CHECK_KEYS);
  });

  test('UpdateSpaceSchema accepts no cipher/key material at all', () => {
    const parsed = UpdateSpaceSchema.parse({
      name: 'Renamed',
      cipherCheck: POLLUTED_CIPHER_CHECK,
      entropy: 'nope',
      key: 'nope',
    } as Record<string, unknown>);
    expect(findKeyMaterial(parsed)).toEqual([]);
    expect('cipherCheck' in parsed).toBe(false);
  });
});

describe('spaces blind-relay: public serializers echo only the challenge', () => {
  test('toPublicSpace whitelists a polluted stored cipherCheck', () => {
    const doc = {
      _id: new ObjectId(),
      slug: 'a', name: 'A', visibility: 'listed' as const,
      // Simulate a document that somehow carries key material at rest:
      cipherCheck: POLLUTED_CIPHER_CHECK as never,
      entropy: 'leaked' as never,
      cipherId: new ObjectId() as never,
      e2ee: true, cipherRequired: true,
      createdBy: new ObjectId(), ownerIdentityId: new ObjectId(),
      allowFreeMembers: false, memberCount: 1,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const pub = toPublicSpace(doc as never);
    expect(findKeyMaterial(pub)).toEqual([]);
    expect(Object.keys(pub.cipherCheck!).sort()).toEqual(ALLOWED_CIPHER_CHECK_KEYS);
  });

  test('toPublicSpaceChannel whitelists a polluted stored cipherCheck', () => {
    const doc = {
      _id: new ObjectId(), spaceId: new ObjectId(), type: 'text' as const,
      name: 'general', position: 0,
      cipherCheck: POLLUTED_CIPHER_CHECK as never,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const pub = toPublicSpaceChannel(doc as never);
    expect(findKeyMaterial(pub)).toEqual([]);
    expect(Object.keys(pub.cipherCheck!).sort()).toEqual(ALLOWED_CIPHER_CHECK_KEYS);
  });

  test('toPublicSpaceMessage echoes cipher payload fields but never key material', () => {
    const doc = {
      _id: new ObjectId(), spaceId: new ObjectId(), channelId: new ObjectId(),
      fromIdentityId: new ObjectId(),
      ciphertext: 'encrypted-bytes', nonce: 'n', cipherId: 'cid-hex',
      key: 'leaked' as never,
      clientMessageId: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(),
    };
    const pub = toPublicSpaceMessage(doc as never);
    expect(findKeyMaterial(pub)).toEqual([]);
    expect(pub.ciphertext).toBe('encrypted-bytes');
    expect(pub.nonce).toBe('n');
    expect(pub.cipherId).toBe('cid-hex');
    expect(pub.content).toBeUndefined();
  });
});

describe('spaces blind-relay: create route stores/echoes only the challenge', () => {
  beforeEach(() => {
    mockHasPaidAccess.mockReset();
    mockHasPaidAccess.mockReturnValue(true);
    for (const repo of [spaceRepo, roleRepo, memberRepo, channelRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findBySlug.mockResolvedValue(null);
    roleRepo.findBySpace.mockResolvedValue([]);
    publishSpaceEvent.mockClear();
    publishSpaceEventToIdentity.mockClear();
  });

  function makeCtx(body: unknown): RouteContext {
    return {
      request: new Request('http://localhost/'),
      url: new URL('http://localhost/'),
      params: {},
      query: new URLSearchParams(''),
      requestId: 'req',
      body,
      locale: 'en',
      errors: {} as never,
      identitySession: {
        identity: { _id: ROUTE_TEST_IDENTITY_ID },
        sessionId: 'test',
        maxVideoDurationSeconds: 300,
        subscriptions: ['access'],
        entitlements: [],
        isLifetime: false,
      } as never,
    } as RouteContext;
  }

  test('smuggled key material is neither persisted nor returned', async () => {
    const result = await createSpaceCtrl(
      makeCtx({
        slug: 'encrypted-space',
        name: 'Encrypted Space',
        visibility: 'listed',
        cipherCheck: POLLUTED_CIPHER_CHECK,
        entropy: 'smuggled',
        cipherId: new ObjectId().toHexString(),
        derivedKey: 'smuggled',
      }),
    );

    expect(result.kind).toBe('ok');

    // The stored document (what the repo was asked to insert).
    expect(spaceRepo.createSpace).toHaveBeenCalledTimes(1);
    const storedDoc = spaceRepo.createSpace.mock.calls[0]![0];
    expect(findKeyMaterial(storedDoc)).toEqual([]);
    expect(storedDoc.cipherCheck).toEqual(CLEAN_CIPHER_CHECK);

    // The API response body.
    const responseSpace = (result as { data: unknown }).data;
    expect(findKeyMaterial(responseSpace)).toEqual([]);
    expect(Object.keys((responseSpace as { cipherCheck: object }).cipherCheck).sort()).toEqual(
      ALLOWED_CIPHER_CHECK_KEYS,
    );
  });

  test('no key material is stored even when the challenge itself is hostile', async () => {
    await createSpaceCtrl(
      makeCtx({
        slug: 'hostile-space',
        name: 'Hostile',
        visibility: 'hidden',
        cipherCheck: POLLUTED_CIPHER_CHECK,
      }),
    );
    const storedDoc = spaceRepo.createSpace.mock.calls[0]![0];
    // Everything the roles/members/channels repos received must be clean too.
    expect(findKeyMaterial(storedDoc)).toEqual([]);
    expect(findKeyMaterial(channelRepo.createChannel.mock.calls[0]?.[0])).toEqual([]);
    expect(findKeyMaterial(roleRepo.createRole.mock.calls.map((c) => c[0]))).toEqual([]);
  });
});

afterAll(() => mock.restore());
