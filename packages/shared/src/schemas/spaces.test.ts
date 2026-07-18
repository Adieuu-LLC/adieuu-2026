import { describe, expect, test } from 'bun:test';
import {
  CreateSpaceSchema,
  UpdateSpaceSchema,
  SendSpaceMessageSchema,
  CreateSpaceInviteSchema,
} from './spaces';
import { SPACE_MESSAGE_MAX_LENGTH } from '../api/spaces-types';

const validCipherCheck = {
  knownValue: 'xyn34d',
  encryptedKnownValue: 'ZW5jcnlwdGVk',
  nonce: 'bm9uY2U',
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
    });
    expect(result.success).toBe(true);
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
      ciphertext: 'ct-base64',
      nonce: 'nonce-base64',
      cipherId: 'cipher-hex',
      clientMessageId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
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
});

describe('CreateSpaceInviteSchema', () => {
  test('accepts a 24-char identity id', () => {
    expect(CreateSpaceInviteSchema.safeParse({ identityId: 'a'.repeat(24) }).success).toBe(true);
  });

  test('rejects a malformed identity id', () => {
    expect(CreateSpaceInviteSchema.safeParse({ identityId: 'short' }).success).toBe(false);
  });
});
