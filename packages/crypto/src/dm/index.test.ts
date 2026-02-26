/**
 * Tests for DM conversation ID derivation utilities.
 */

import { describe, it, expect } from 'bun:test';
import { deriveConversationId, validateConversationId } from './index';

describe('deriveConversationId', () => {
  it('should produce a 64-character hex string', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    const convId = deriveConversationId(id1, id2);

    expect(convId).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(convId)).toBe(true);
  });

  it('should be symmetric (order-independent)', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    const convId1 = deriveConversationId(id1, id2);
    const convId2 = deriveConversationId(id2, id1);

    expect(convId1).toBe(convId2);
  });

  it('should be deterministic', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    const convId1 = deriveConversationId(id1, id2);
    const convId2 = deriveConversationId(id1, id2);

    expect(convId1).toBe(convId2);
  });

  it('should produce different IDs for different identity pairs', () => {
    const alice = '507f1f77bcf86cd799439011';
    const bob = '507f1f77bcf86cd799439012';
    const carol = '507f1f77bcf86cd799439013';

    const aliceBob = deriveConversationId(alice, bob);
    const aliceCarol = deriveConversationId(alice, carol);
    const bobCarol = deriveConversationId(bob, carol);

    expect(aliceBob).not.toBe(aliceCarol);
    expect(aliceBob).not.toBe(bobCarol);
    expect(aliceCarol).not.toBe(bobCarol);
  });

  it('should handle same identity twice (edge case)', () => {
    const id = '507f1f77bcf86cd799439011';

    const convId = deriveConversationId(id, id);

    expect(convId).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(convId)).toBe(true);
  });
});

describe('validateConversationId', () => {
  it('should return true for valid conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const convId = deriveConversationId(id1, id2);

    expect(validateConversationId(convId, id1, id2)).toBe(true);
    expect(validateConversationId(convId, id2, id1)).toBe(true);
  });

  it('should return false for invalid conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const id3 = '507f1f77bcf86cd799439013';
    const convId = deriveConversationId(id1, id2);

    expect(validateConversationId(convId, id1, id3)).toBe(false);
    expect(validateConversationId(convId, id2, id3)).toBe(false);
  });

  it('should return false for tampered conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const convId = deriveConversationId(id1, id2);

    const tamperedId = 'a' + convId.slice(1);

    expect(validateConversationId(tamperedId, id1, id2)).toBe(false);
  });

  it('should return false for empty conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    expect(validateConversationId('', id1, id2)).toBe(false);
  });
});
