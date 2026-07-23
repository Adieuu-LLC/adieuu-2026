import { describe, expect, test } from 'bun:test';
import {
  CreateSpaceSchema,
  UpdateSpaceSchema,
  SendSpaceMessageSchema,
  CreateSpaceInviteSchema,
  AddSpaceReactionSchema,
} from './spaces';
import {
  SPACE_MESSAGE_MAX_LENGTH,
  SPACE_MESSAGE_MAX_EXPIRES_SECONDS,
} from '../api/spaces-types';

// Cipher ids are hex digests (see @adieuu/crypto generateCipherId).
const VALID_CIPHER_ID = 'ab01cd23ef45'.repeat(4);

const validCipherCheck = {
  knownValue: 'xyn34d',
  encryptedKnownValue: 'ZW5jcnlwdGVk',
  nonce: 'bm9uY2U=',
};

const validEncryptedField = {
  encryptedName: 'ZW5jLW5hbWU=',
  nameNonce: 'bm9uY2U=',
  cipherId: VALID_CIPHER_ID,
};

const validEncryptedSeed = {
  category: { ...validEncryptedField },
  channel: { ...validEncryptedField },
  roles: [
    { system: 'admin' as const, ...validEncryptedField },
    { system: 'everyone' as const, ...validEncryptedField },
  ],
};

describe('CreateSpaceSchema', () => {
  test('accepts a minimal valid public space', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'My Space',
      visibility: 'public',
    });
    expect(result.success).toBe(true);
  });

  test('accepts a listed space with a cipher challenge and client-generated id', () => {
    const result = CreateSpaceSchema.safeParse({
      id: 'a'.repeat(24),
      slug: 'secret-club',
      name: 'Secret Club',
      description: 'members only',
      visibility: 'listed',
      allowFreeMembers: true,
      cipherCheck: validCipherCheck,
      e2ee: true,
      cipherRequired: true,
      encryptedSeed: validEncryptedSeed,
    });
    expect(result.success).toBe(true);
  });

  test('accepts encryptIdentity with encrypted name fields and no plaintext', () => {
    const result = CreateSpaceSchema.safeParse({
      id: 'a'.repeat(24),
      slug: 'secret-club',
      visibility: 'listed',
      cipherCheck: validCipherCheck,
      e2ee: true,
      encryptIdentity: true,
      cipherRequired: true,
      encryptedSeed: validEncryptedSeed,
      encryptedName: 'ZW5jLW5hbWU=',
      nameNonce: 'bm9uY2U=',
      cipherId: VALID_CIPHER_ID,
      encryptedDescription: 'ZW5jLWRlc2M=',
      descriptionNonce: 'ZGVzYy1ub25jZQ==',
    });
    expect(result.success).toBe(true);
  });

  test('rejects encryptIdentity without e2ee', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'secret-club',
      name: 'Secret',
      visibility: 'listed',
      cipherCheck: validCipherCheck,
      encryptIdentity: true,
      cipherRequired: true,
      encryptedName: 'ZW5jLW5hbWU=',
      nameNonce: 'bm9uY2U=',
      cipherId: VALID_CIPHER_ID,
    });
    expect(result.success).toBe(false);
  });

  test('rejects e2ee without encryptedSeed', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'secret-club',
      name: 'Secret',
      visibility: 'listed',
      cipherCheck: validCipherCheck,
      e2ee: true,
    });
    expect(result.success).toBe(false);
  });

  test('accepts a hidden space with id and no vanity slug', () => {
    const id = 'a'.repeat(24);
    const result = CreateSpaceSchema.safeParse({
      id,
      name: 'Secret Hideout',
      visibility: 'hidden',
    });
    expect(result.success).toBe(true);
  });

  test('accepts a hidden space when slug equals id', () => {
    const id = 'b'.repeat(24);
    const result = CreateSpaceSchema.safeParse({
      id,
      slug: id,
      name: 'Secret Hideout',
      visibility: 'hidden',
    });
    expect(result.success).toBe(true);
  });

  test('rejects a hidden space without id', () => {
    const result = CreateSpaceSchema.safeParse({
      name: 'Secret Hideout',
      visibility: 'hidden',
    });
    expect(result.success).toBe(false);
  });

  test('rejects a hidden space when slug differs from id', () => {
    const result = CreateSpaceSchema.safeParse({
      id: 'a'.repeat(24),
      slug: 'custom-vanity',
      name: 'Secret Hideout',
      visibility: 'hidden',
    });
    expect(result.success).toBe(false);
  });

  test('rejects public/listed without slug', () => {
    expect(
      CreateSpaceSchema.safeParse({ name: 'X', visibility: 'public' }).success,
    ).toBe(false);
    expect(
      CreateSpaceSchema.safeParse({ name: 'X', visibility: 'listed' }).success,
    ).toBe(false);
  });

  test('rejects encryptIdentity with plaintext name', () => {
    const result = CreateSpaceSchema.safeParse({
      id: 'a'.repeat(24),
      slug: 'secret-club',
      name: 'Secret Club',
      visibility: 'listed',
      cipherCheck: validCipherCheck,
      e2ee: true,
      encryptIdentity: true,
      encryptedSeed: validEncryptedSeed,
      encryptedName: 'ZW5jLW5hbWU',
      nameNonce: 'bm9uY2U',
      cipherId: 'cipher-hex',
    });
    expect(result.success).toBe(false);
  });

  test('accepts gate-only cipherRequired without e2ee', () => {
    const result = CreateSpaceSchema.safeParse({
      id: 'a'.repeat(24),
      slug: 'gated-club',
      name: 'Gated Club',
      visibility: 'listed',
      cipherCheck: validCipherCheck,
      e2ee: false,
      cipherRequired: true,
    });
    expect(result.success).toBe(true);
  });

  test('rejects e2ee without cipherCheck', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'broken',
      name: 'Broken',
      visibility: 'listed',
      e2ee: true,
    });
    expect(result.success).toBe(false);
  });

  test('rejects public with cipherRequired', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'My Space',
      visibility: 'public',
      cipherRequired: true,
      cipherCheck: validCipherCheck,
    });
    expect(result.success).toBe(false);
  });

  test.each([
    ['uppercase', 'My-Space'],
    ['too short', 'ab'],
    ['leading hyphen', '-space'],
    ['trailing hyphen', 'space-'],
    ['spaces', 'my space'],
    ['underscore', 'my_space'],
  ])('rejects invalid slug (%s)', (_label, slug) => {
    const result = CreateSpaceSchema.safeParse({ slug, name: 'X', visibility: 'public' });
    expect(result.success).toBe(false);
  });

  test('rejects unknown visibility', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'My Space',
      visibility: 'unlisted',
    });
    expect(result.success).toBe(false);
  });

  test('rejects an oversized name', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'x'.repeat(101),
      visibility: 'public',
    });
    expect(result.success).toBe(false);
  });

  test('rejects an oversized description', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'My Space',
      visibility: 'listed',
      description: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test('rejects a public space with a cipher challenge', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'My Space',
      visibility: 'public',
      cipherCheck: validCipherCheck,
    });
    expect(result.success).toBe(false);
  });

  test('rejects a malformed cipher challenge', () => {
    const result = CreateSpaceSchema.safeParse({
      slug: 'my-space',
      name: 'My Space',
      visibility: 'hidden',
      cipherCheck: { knownValue: '', encryptedKnownValue: '', nonce: '' },
    });
    expect(result.success).toBe(false);
  });

  test('rejects a client id that is not 24 chars', () => {
    const result = CreateSpaceSchema.safeParse({
      id: 'abc',
      slug: 'my-space',
      name: 'My Space',
      visibility: 'public',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateSpaceSchema', () => {
  test('accepts a single-field patch', () => {
    expect(UpdateSpaceSchema.safeParse({ allowFreeMembers: true }).success).toBe(true);
  });

  test('accepts cipherRequired patch', () => {
    expect(UpdateSpaceSchema.safeParse({ cipherRequired: false }).success).toBe(true);
  });

  test('strips immutable cipherCheck / e2ee from updates', () => {
    const parsed = UpdateSpaceSchema.parse({
      name: 'X',
      cipherCheck: validCipherCheck,
      e2ee: true,
    } as never);
    expect(parsed).toEqual({ name: 'X' });
  });

  test('rejects an empty patch', () => {
    expect(UpdateSpaceSchema.safeParse({}).success).toBe(false);
  });
});

describe('SendSpaceMessageSchema', () => {
  test('accepts a valid plaintext message', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hello',
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  test('accepts a valid encrypted message', () => {
    const result = SendSpaceMessageSchema.safeParse({
      ciphertext: 'Y3QtYmFzZTY0',
      nonce: 'bm9uY2ViYXNlNjQ=',
      cipherId: VALID_CIPHER_ID,
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  test('rejects non-base64 ciphertext (charset guard on opaque cipher fields)', () => {
    const result = SendSpaceMessageSchema.safeParse({
      ciphertext: '<script>alert(1)</script>',
      nonce: 'bm9uY2U=',
      cipherId: VALID_CIPHER_ID,
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('rejects a non-hex cipherId', () => {
    const result = SendSpaceMessageSchema.safeParse({
      ciphertext: 'Y3Q=',
      nonce: 'bm9uY2U=',
      cipherId: 'not-a-hex-digest!',
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('rejects when both content and cipher fields are provided', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hello',
      ciphertext: 'ct',
      nonce: 'nn',
      cipherId: 'cid',
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('rejects when neither content nor cipher fields are provided', () => {
    const result = SendSpaceMessageSchema.safeParse({
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('accepts plaintext with attachmentMediaIds', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hello',
      clientMessageId: crypto.randomUUID(),
      attachmentMediaIds: ['media-1', 'media-2'],
    });
    expect(result.success).toBe(true);
  });

  test('accepts attachment-only plaintext (no content)', () => {
    const result = SendSpaceMessageSchema.safeParse({
      clientMessageId: crypto.randomUUID(),
      attachmentMediaIds: ['media-1'],
    });
    expect(result.success).toBe(true);
  });

  test('accepts encrypted message with e2eMediaIds', () => {
    const result = SendSpaceMessageSchema.safeParse({
      ciphertext: 'Y3QtYmFzZTY0',
      nonce: 'bm9uY2ViYXNlNjQ=',
      cipherId: VALID_CIPHER_ID,
      clientMessageId: crypto.randomUUID(),
      e2eMediaIds: ['e2e-1'],
    });
    expect(result.success).toBe(true);
  });

  test('rejects mixing attachmentMediaIds with cipher fields', () => {
    const result = SendSpaceMessageSchema.safeParse({
      ciphertext: 'Y3QtYmFzZTY0',
      nonce: 'bm9uY2ViYXNlNjQ=',
      cipherId: VALID_CIPHER_ID,
      clientMessageId: crypto.randomUUID(),
      attachmentMediaIds: ['media-1'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects mixing e2eMediaIds with plaintext content', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hello',
      clientMessageId: crypto.randomUUID(),
      e2eMediaIds: ['e2e-1'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects more than SPACE_MESSAGE_MAX_ATTACHMENTS', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hello',
      clientMessageId: crypto.randomUUID(),
      attachmentMediaIds: Array.from({ length: 11 }, (_, i) => `m${i}`),
    });
    expect(result.success).toBe(false);
  });

  test('rejects an empty plaintext message', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: '',
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('rejects an over-long plaintext message', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'x'.repeat(SPACE_MESSAGE_MAX_LENGTH + 1),
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('rejects a non-uuid clientMessageId', () => {
    const result = SendSpaceMessageSchema.safeParse({ content: 'hi', clientMessageId: 'nope' });
    expect(result.success).toBe(false);
  });

  test('rejects partial cipher fields (missing nonce)', () => {
    const result = SendSpaceMessageSchema.safeParse({
      ciphertext: 'ct',
      cipherId: 'cid',
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  test('accepts expiresInSeconds up to the 30-day cap', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hi',
      clientMessageId: crypto.randomUUID(),
      expiresInSeconds: SPACE_MESSAGE_MAX_EXPIRES_SECONDS,
    });
    expect(result.success).toBe(true);
  });

  test('rejects expiresInSeconds beyond the cap', () => {
    const result = SendSpaceMessageSchema.safeParse({
      content: 'hi',
      clientMessageId: crypto.randomUUID(),
      expiresInSeconds: SPACE_MESSAGE_MAX_EXPIRES_SECONDS + 1,
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-positive and fractional expiresInSeconds', () => {
    for (const expiresInSeconds of [0, -1, 1.5]) {
      const result = SendSpaceMessageSchema.safeParse({
        content: 'hi',
        clientMessageId: crypto.randomUUID(),
        expiresInSeconds,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('AddSpaceReactionSchema', () => {
  test('accepts Unicode emoji and custom tokens', () => {
    expect(AddSpaceReactionSchema.safeParse({ emoji: '👍' }).success).toBe(true);
    expect(AddSpaceReactionSchema.safeParse({ emoji: '👨‍👩‍👧‍👦' }).success).toBe(true);
    expect(
      AddSpaceReactionSchema.safeParse({ emoji: `custom:${'ab'.repeat(12)}` }).success,
    ).toBe(true);
    expect(AddSpaceReactionSchema.safeParse({ emoji: ':party-parrot:' }).success).toBe(true);
  });

  test('rejects arbitrary text as a reaction', () => {
    expect(AddSpaceReactionSchema.safeParse({ emoji: 'hello' }).success).toBe(false);
    expect(AddSpaceReactionSchema.safeParse({ emoji: '<img src=x>' }).success).toBe(false);
    expect(AddSpaceReactionSchema.safeParse({ emoji: 'a'.repeat(32) }).success).toBe(false);
  });

  test('rejects empty and oversized values', () => {
    expect(AddSpaceReactionSchema.safeParse({ emoji: '' }).success).toBe(false);
    expect(AddSpaceReactionSchema.safeParse({ emoji: '😀'.repeat(20) }).success).toBe(false);
  });
});

describe('CreateSpaceInviteSchema', () => {
  test('accepts a 24-char identity id', () => {
    expect(CreateSpaceInviteSchema.safeParse({ identityId: 'a'.repeat(24) }).success).toBe(true);
  });

  test('rejects a malformed identity id', () => {
    expect(CreateSpaceInviteSchema.safeParse({ identityId: 'short' }).success).toBe(false);
  });
});
