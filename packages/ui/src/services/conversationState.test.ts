/**
 * Tests for conversation state optimistic update logic.
 *
 * Validates the hasUnreadMessages comparisons that drive the
 * markRead and bumpLatestMessage optimistic updates in useDmConversationsList.
 */

import { describe, it, expect } from 'bun:test';
import { hasUnreadMessages } from './readStateService';

describe('Conversation State Optimistic Updates', () => {
  const olderMessageId = '65a1b2c3d4e5f6a7b8c9d0e1';
  const newerMessageId = '65a1b2c3d4e5f6a7b8c9d0e5';
  const newestMessageId = '65a1b2c3d4e5f6a7b8c9d0f0';

  describe('markRead clears unread when read message matches latest', () => {
    it('should show unread when lastReadMessageId is behind lastMessageId', () => {
      expect(hasUnreadMessages(newerMessageId, olderMessageId)).toBe(true);
    });

    it('should clear unread when marking read up to the latest message', () => {
      expect(hasUnreadMessages(newerMessageId, newerMessageId)).toBe(false);
    });

    it('should clear unread when marking read past the latest message', () => {
      expect(hasUnreadMessages(newerMessageId, newestMessageId)).toBe(false);
    });

    it('should show unread when lastReadMessageId is null', () => {
      expect(hasUnreadMessages(newerMessageId, null)).toBe(true);
    });

    it('should not show unread when lastMessageId is null', () => {
      expect(hasUnreadMessages(null, olderMessageId)).toBe(false);
    });
  });

  describe('bumpLatestMessage recomputes unread correctly', () => {
    it('should set unread when new message arrives after last read', () => {
      const lastReadMessageId = olderMessageId;
      const newLastMessageId = newerMessageId;
      expect(hasUnreadMessages(newLastMessageId, lastReadMessageId)).toBe(true);
    });

    it('should not set unread when new message is already read', () => {
      const lastReadMessageId = newestMessageId;
      const newLastMessageId = newerMessageId;
      expect(hasUnreadMessages(newLastMessageId, lastReadMessageId)).toBe(false);
    });

    it('should set unread when user has never read the conversation', () => {
      expect(hasUnreadMessages(newerMessageId, null)).toBe(true);
    });
  });

  describe('markRead followed by bumpLatestMessage race condition', () => {
    it('should show unread when new message arrives after marking read', () => {
      const readUpTo = newerMessageId;
      const newMessageArrives = newestMessageId;

      const afterMarkRead = hasUnreadMessages(newerMessageId, readUpTo);
      expect(afterMarkRead).toBe(false);

      const afterBump = hasUnreadMessages(newMessageArrives, readUpTo);
      expect(afterBump).toBe(true);
    });

    it('should clear unread when marking read after new message', () => {
      const newMessageArrives = newestMessageId;
      const readUpTo = newestMessageId;

      const afterBump = hasUnreadMessages(newMessageArrives, olderMessageId);
      expect(afterBump).toBe(true);

      const afterMarkRead = hasUnreadMessages(newMessageArrives, readUpTo);
      expect(afterMarkRead).toBe(false);
    });
  });
});
