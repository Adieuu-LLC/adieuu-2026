import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getCachedParticipant,
  cacheParticipant,
  removeCachedParticipant,
  getAllCachedParticipants,
  clearParticipantCache,
  findConversationByParticipant,
  updateCachedSigningKey,
  type ParticipantCacheEntry,
} from './participantCache';

describe('Participant Cache Service', () => {
  const myIdentityId = '507f1f77bcf86cd799439011';
  const otherMyIdentityId = '507f1f77bcf86cd799439099';
  const otherIdentityId = '507f1f77bcf86cd799439012';
  const conversationId = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1';
  const signingPublicKey = 'SGVsbG8gV29ybGQhIQ==';

  const testEntry: ParticipantCacheEntry = {
    conversationId,
    otherIdentityId,
    signingPublicKey,
    cachedAt: Date.now(),
    myIdentityId,
  };

  beforeEach(async () => {
    await clearParticipantCache(myIdentityId);
    await clearParticipantCache(otherMyIdentityId);
  });

  afterEach(async () => {
    await clearParticipantCache(myIdentityId);
    await clearParticipantCache(otherMyIdentityId);
  });

  it('test environment provides IndexedDB', () => {
    expect(globalThis.indexedDB).toBeDefined();
    expect(globalThis.indexedDB).not.toBeNull();
  });

  describe('cacheParticipant / getCachedParticipant', () => {
    it('should cache and retrieve a participant entry', async () => {
      await cacheParticipant(testEntry);
      const retrieved = await getCachedParticipant(myIdentityId, conversationId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.conversationId).toBe(conversationId);
      expect(retrieved?.otherIdentityId).toBe(otherIdentityId);
      expect(retrieved?.signingPublicKey).toBe(signingPublicKey);
      expect(retrieved?.myIdentityId).toBe(myIdentityId);
    });

    it('should return null for non-existent entry', async () => {
      const retrieved = await getCachedParticipant(myIdentityId, 'nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should update existing entry on re-cache', async () => {
      await cacheParticipant(testEntry);

      const updatedEntry: ParticipantCacheEntry = {
        ...testEntry,
        signingPublicKey: 'VXBkYXRlZCBLZXk=',
        cachedAt: Date.now() + 1000,
      };
      await cacheParticipant(updatedEntry);

      const retrieved = await getCachedParticipant(myIdentityId, conversationId);
      expect(retrieved?.signingPublicKey).toBe('VXBkYXRlZCBLZXk=');
    });

    it('should isolate entries by identity', async () => {
      await cacheParticipant(testEntry);

      const retrievedSameIdentity = await getCachedParticipant(myIdentityId, conversationId);
      expect(retrievedSameIdentity).not.toBeNull();

      const retrievedOtherIdentity = await getCachedParticipant(otherMyIdentityId, conversationId);
      expect(retrievedOtherIdentity).toBeNull();
    });
  });

  describe('removeCachedParticipant', () => {
    it('should remove a cached entry', async () => {
      await cacheParticipant(testEntry);
      await removeCachedParticipant(myIdentityId, conversationId);

      const retrieved = await getCachedParticipant(myIdentityId, conversationId);
      expect(retrieved).toBeNull();
    });

    it('should not throw when removing non-existent entry', async () => {
      await removeCachedParticipant(myIdentityId, 'nonexistent');
    });
  });

  describe('getAllCachedParticipants', () => {
    it('should return all entries for an identity', async () => {
      const entry2: ParticipantCacheEntry = {
        conversationId: 'def456abc123def456abc123def456abc123def456abc123def456abc123def4',
        otherIdentityId: '507f1f77bcf86cd799439013',
        signingPublicKey: 'QW5vdGhlciBLZXk=',
        cachedAt: Date.now(),
        myIdentityId,
      };

      await cacheParticipant(testEntry);
      await cacheParticipant(entry2);

      const all = await getAllCachedParticipants(myIdentityId);
      expect(all.length).toBe(2);
      expect(all.map((e) => e.conversationId)).toContain(conversationId);
      expect(all.map((e) => e.conversationId)).toContain(entry2.conversationId);
    });

    it('should return empty array when no entries', async () => {
      const all = await getAllCachedParticipants(myIdentityId);
      expect(all).toEqual([]);
    });
  });

  describe('clearParticipantCache', () => {
    it('should clear all entries for an identity', async () => {
      const entry2: ParticipantCacheEntry = {
        conversationId: 'def456abc123def456abc123def456abc123def456abc123def456abc123def4',
        otherIdentityId: '507f1f77bcf86cd799439013',
        signingPublicKey: 'QW5vdGhlciBLZXk=',
        cachedAt: Date.now(),
        myIdentityId,
      };

      await cacheParticipant(testEntry);
      await cacheParticipant(entry2);
      await clearParticipantCache(myIdentityId);

      const all = await getAllCachedParticipants(myIdentityId);
      expect(all.length).toBe(0);
    });

    it('should not clear entries owned by other identities', async () => {
      const otherEntry: ParticipantCacheEntry = {
        ...testEntry,
        myIdentityId: otherMyIdentityId,
        conversationId: 'fff456abc123def456abc123def456abc123def456abc123def456abc123def4',
      };

      await cacheParticipant(testEntry);
      await cacheParticipant(otherEntry);
      await clearParticipantCache(myIdentityId);

      expect(await getAllCachedParticipants(myIdentityId)).toEqual([]);
      const remainingOther = await getAllCachedParticipants(otherMyIdentityId);
      expect(remainingOther.length).toBe(1);
      expect(remainingOther[0]?.conversationId).toBe(otherEntry.conversationId);
    });
  });

  describe('findConversationByParticipant', () => {
    it('should find conversation by other participant ID', async () => {
      await cacheParticipant(testEntry);

      const found = await findConversationByParticipant(myIdentityId, otherIdentityId);
      expect(found).toBe(conversationId);
    });

    it('should return null when not found', async () => {
      const found = await findConversationByParticipant(myIdentityId, 'nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('updateCachedSigningKey', () => {
    it('should update signing key for existing entry', async () => {
      await cacheParticipant(testEntry);

      const newKey = 'TmV3IFNpZ25pbmcgS2V5';
      await updateCachedSigningKey(myIdentityId, conversationId, newKey);

      const retrieved = await getCachedParticipant(myIdentityId, conversationId);
      expect(retrieved?.signingPublicKey).toBe(newKey);
    });

    it('should not throw when entry does not exist', async () => {
      await updateCachedSigningKey(myIdentityId, 'nonexistent', 'key');
    });
  });
});
