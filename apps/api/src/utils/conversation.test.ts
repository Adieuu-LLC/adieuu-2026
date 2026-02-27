import { describe, expect, test } from 'bun:test';
import { deriveConversationId, validateConversationId, deriveParticipantHash } from './conversation';

describe('deriveConversationId', () => {
  const aliceId = '507f1f77bcf86cd799439011';
  const bobId = '507f1f77bcf86cd799439022';

  test('produces consistent output for same inputs', () => {
    const result1 = deriveConversationId(aliceId, bobId);
    const result2 = deriveConversationId(aliceId, bobId);

    expect(result1).toBe(result2);
  });

  test('produces same output regardless of input order (symmetry)', () => {
    const aliceToBob = deriveConversationId(aliceId, bobId);
    const bobToAlice = deriveConversationId(bobId, aliceId);

    expect(aliceToBob).toBe(bobToAlice);
  });

  test('produces 64-character hex string (SHA3-256)', () => {
    const result = deriveConversationId(aliceId, bobId);

    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  test('produces different output for different identity pairs', () => {
    const carolId = '507f1f77bcf86cd799439033';

    const aliceBob = deriveConversationId(aliceId, bobId);
    const aliceCarol = deriveConversationId(aliceId, carolId);
    const bobCarol = deriveConversationId(bobId, carolId);

    expect(aliceBob).not.toBe(aliceCarol);
    expect(aliceBob).not.toBe(bobCarol);
    expect(aliceCarol).not.toBe(bobCarol);
  });

  test('produces different output even for similar IDs', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const id3 = '507f1f77bcf86cd799439013';

    const conv12 = deriveConversationId(id1, id2);
    const conv13 = deriveConversationId(id1, id3);

    expect(conv12).not.toBe(conv13);
  });
});

describe('validateConversationId', () => {
  const aliceId = '507f1f77bcf86cd799439011';
  const bobId = '507f1f77bcf86cd799439022';

  test('returns true for valid conversation ID', () => {
    const conversationId = deriveConversationId(aliceId, bobId);

    expect(validateConversationId(conversationId, aliceId, bobId)).toBe(true);
  });

  test('returns true regardless of identity order', () => {
    const conversationId = deriveConversationId(aliceId, bobId);

    expect(validateConversationId(conversationId, aliceId, bobId)).toBe(true);
    expect(validateConversationId(conversationId, bobId, aliceId)).toBe(true);
  });

  test('returns false for invalid conversation ID', () => {
    const wrongConversationId = 'a'.repeat(64);

    expect(validateConversationId(wrongConversationId, aliceId, bobId)).toBe(false);
  });

  test('returns false for conversation ID from different participants', () => {
    const carolId = '507f1f77bcf86cd799439033';
    const aliceBobConv = deriveConversationId(aliceId, bobId);

    expect(validateConversationId(aliceBobConv, aliceId, carolId)).toBe(false);
    expect(validateConversationId(aliceBobConv, bobId, carolId)).toBe(false);
  });

  test('returns false for truncated conversation ID', () => {
    const validConvId = deriveConversationId(aliceId, bobId);
    const truncated = validConvId.substring(0, 32);

    expect(validateConversationId(truncated, aliceId, bobId)).toBe(false);
  });

  test('returns false for modified conversation ID', () => {
    const validConvId = deriveConversationId(aliceId, bobId);
    const modified = 'f' + validConvId.substring(1);

    expect(validateConversationId(modified, aliceId, bobId)).toBe(false);
  });
});

describe('deriveParticipantHash', () => {
  const aliceId = '507f1f77bcf86cd799439011';
  const bobId = '507f1f77bcf86cd799439022';
  const conversationId = deriveConversationId(aliceId, bobId);

  test('produces a 64-character hex string', () => {
    const hash = deriveParticipantHash(aliceId, conversationId);

    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  test('produces consistent output for same inputs', () => {
    const hash1 = deriveParticipantHash(aliceId, conversationId);
    const hash2 = deriveParticipantHash(aliceId, conversationId);

    expect(hash1).toBe(hash2);
  });

  test('produces different hashes for different identities in same conversation', () => {
    const aliceHash = deriveParticipantHash(aliceId, conversationId);
    const bobHash = deriveParticipantHash(bobId, conversationId);

    expect(aliceHash).not.toBe(bobHash);
  });

  test('produces different hashes for same identity in different conversations', () => {
    const carolId = '507f1f77bcf86cd799439033';
    const convIdAliceCarol = deriveConversationId(aliceId, carolId);

    const hashInAliceBob = deriveParticipantHash(aliceId, conversationId);
    const hashInAliceCarol = deriveParticipantHash(aliceId, convIdAliceCarol);

    expect(hashInAliceBob).not.toBe(hashInAliceCarol);
  });

  test('produces different result from conversation ID', () => {
    const hash = deriveParticipantHash(aliceId, conversationId);

    expect(hash).not.toBe(conversationId);
  });
});
