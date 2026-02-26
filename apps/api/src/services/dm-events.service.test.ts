import { describe, expect, test, mock, beforeEach } from 'bun:test';

mock.module('../config', () => ({
  config: {
    env: 'test',
    redis: { url: 'redis://localhost:6379', keyPrefix: 'test:' },
  },
}));

const mockPublish = mock(() => Promise.resolve(1));
const mockIsConnected = mock(() => true);

mock.module('../db/redis', () => ({
  getRedis: () => ({
    publish: mockPublish,
  }),
  isRedisConnected: mockIsConnected,
  RedisKeys: {
    identityChannel: (id: string) => `identity:${id}`,
  },
}));

import {
  publishNewMessage,
  publishReadStateUpdate,
  publishTypingIndicator,
} from './dm-events.service';
import type { PublicDmMessage } from '../models/dm-message';

describe('DM Events Service', () => {
  beforeEach(() => {
    mockPublish.mockReset();
    mockIsConnected.mockReset();
    mockPublish.mockImplementation(() => Promise.resolve(1));
    mockIsConnected.mockImplementation(() => true);
  });

  describe('publishNewMessage', () => {
    const mockMessage: PublicDmMessage = {
      id: 'msg-123',
      conversationId: 'a'.repeat(64),
      toIdentityId: 'recipient-id',
      encryptedSenderId: 'encrypted-sender-base64',
      ciphertext: 'encrypted-content',
      nonce: 'nonce-value',
      wrappedKeys: [],
      signature: 'sig-value',
      cryptoProfile: 'default',
      clientMessageId: 'client-msg-123',
      createdAt: new Date().toISOString(),
    };

    test('publishes to correct channel', async () => {
      await publishNewMessage('recipient-id', mockMessage);

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const call = mockPublish.mock.calls[0] as unknown as [string, string];
      const [channel, payload] = call;
      expect(channel).toBe('identity:recipient-id');

      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe('dm:new');
      expect(parsed.payload.message.id).toBe('msg-123');
    });

    test('does not throw when Redis is disconnected', async () => {
      mockIsConnected.mockImplementation(() => false);

      await expect(publishNewMessage('recipient-id', mockMessage)).resolves.toBeUndefined();
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });

  describe('publishReadStateUpdate', () => {
    test('publishes read state to other participant', async () => {
      await publishReadStateUpdate(
        'other-participant-id',
        'a'.repeat(64),
        'reader-id',
        'encrypted-last-read-base64'
      );

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const call = mockPublish.mock.calls[0] as unknown as [string, string];
      const [channel, payload] = call;
      expect(channel).toBe('identity:other-participant-id');

      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe('dm:read');
      expect(parsed.payload.conversationId).toBe('a'.repeat(64));
      expect(parsed.payload.identityId).toBe('reader-id');
      expect(parsed.payload.encryptedLastReadId).toBe('encrypted-last-read-base64');
    });
  });

  describe('publishTypingIndicator', () => {
    test('publishes typing indicator to other participant', async () => {
      await publishTypingIndicator(
        'other-participant-id',
        'a'.repeat(64),
        'typing-user-id',
        true
      );

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const call = mockPublish.mock.calls[0] as unknown as [string, string];
      const [channel, payload] = call;
      expect(channel).toBe('identity:other-participant-id');

      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe('dm:typing');
      expect(parsed.payload.conversationId).toBe('a'.repeat(64));
      expect(parsed.payload.identityId).toBe('typing-user-id');
      expect(parsed.payload.isTyping).toBe(true);
    });
  });
});
