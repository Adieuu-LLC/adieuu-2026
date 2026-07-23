/**
 * Unit tests for Space input sanitization helpers.
 *
 * @module routes/spaces/space-inputs.test
 */

import { describe, expect, test } from 'bun:test';
import {
  sanitizeSpaceObjectId,
  parseSpaceListCursor,
  clampSpaceListLimit,
  sanitizeSpaceSlug,
  sanitizeSpaceName,
  sanitizeSpaceDescription,
  sanitizeSpaceMessageContent,
  sanitizeClientMessageId,
  sanitizeSpaceSearchTerm,
  sanitizeSpaceRoleName,
  sanitizeSpaceChannelName,
  sanitizeSpaceNickname,
  sanitizeSpaceBanReason,
} from './space-inputs';

const VALID_ID = '507f1f77bcf86cd799439011';
const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('space-inputs', () => {
  describe('sanitizeSpaceObjectId', () => {
    test('accepts valid hex ObjectId', () => {
      expect(sanitizeSpaceObjectId(VALID_ID)).toEqual({ ok: true, id: VALID_ID });
    });

    test('strips zero-width characters then validates', () => {
      const withZw = `${VALID_ID.slice(0, 12)}\u200b${VALID_ID.slice(12)}`;
      expect(sanitizeSpaceObjectId(withZw)).toEqual({ ok: true, id: VALID_ID });
    });

    test('rejects garbage', () => {
      expect(sanitizeSpaceObjectId('not-an-id')).toEqual({ ok: false });
    });
  });

  describe('parseSpaceListCursor', () => {
    test('undefined when absent', () => {
      expect(parseSpaceListCursor(null)).toBeUndefined();
    });
    test('returns valid cursor', () => {
      expect(parseSpaceListCursor(VALID_ID)).toBe(VALID_ID);
    });
    test('drops invalid cursor', () => {
      expect(parseSpaceListCursor('zzzz')).toBeUndefined();
    });
  });

  describe('clampSpaceListLimit', () => {
    test('defaults when missing/invalid', () => {
      expect(clampSpaceListLimit(null)).toBe(30);
      expect(clampSpaceListLimit('abc')).toBe(30);
      expect(clampSpaceListLimit('0')).toBe(30);
    });
    test('caps at max', () => {
      expect(clampSpaceListLimit('9999')).toBe(100);
    });
    test('honors valid value', () => {
      expect(clampSpaceListLimit('20')).toBe(20);
    });
  });

  describe('sanitizeSpaceSlug', () => {
    test('accepts a clean slug', () => {
      expect(sanitizeSpaceSlug('my-space')).toEqual({ ok: true, slug: 'my-space' });
    });
    test('lowercases and strips invalid characters', () => {
      // Spaces/symbols removed by alphanumdash → 'mycoolspace' (valid)
      expect(sanitizeSpaceSlug('My Cool Space!')).toEqual({ ok: true, slug: 'mycoolspace' });
    });
    test('rejects when result is too short', () => {
      expect(sanitizeSpaceSlug('a!')).toEqual({ ok: false });
    });
    test('rejects leading/trailing hyphen after strip', () => {
      expect(sanitizeSpaceSlug('-abc-')).toEqual({ ok: false });
    });
    test('strips zero-width injection', () => {
      expect(sanitizeSpaceSlug('my\u200bspace')).toEqual({ ok: true, slug: 'myspace' });
    });
  });

  describe('sanitizeSpaceName', () => {
    test('keeps international text and emoji', () => {
      const r = sanitizeSpaceName('Café 日本 🚀');
      expect(r).toEqual({ ok: true, name: 'Café 日本 🚀' });
    });
    test('strips template-literal injection', () => {
      const r = sanitizeSpaceName('hello ${evil}');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.name).not.toContain('${');
    });
    test('rejects empty after sanitize', () => {
      expect(sanitizeSpaceName('\u200b\u200b')).toEqual({ ok: false });
    });
    test('rejects undefined', () => {
      expect(sanitizeSpaceName(undefined)).toEqual({ ok: false });
    });
  });

  describe('sanitizeSpaceDescription', () => {
    test('undefined passes through', () => {
      expect(sanitizeSpaceDescription(undefined)).toEqual({ ok: true, description: undefined });
    });
    test('blank collapses to undefined', () => {
      expect(sanitizeSpaceDescription('   ')).toEqual({ ok: true, description: undefined });
    });
    test('keeps real content', () => {
      expect(sanitizeSpaceDescription('A place')).toEqual({ ok: true, description: 'A place' });
    });
  });

  describe('sanitizeSpaceMessageContent', () => {
    test('accepts content', () => {
      expect(sanitizeSpaceMessageContent('hello world')).toEqual({
        ok: true,
        content: 'hello world',
      });
    });
    test('rejects empty after sanitize', () => {
      expect(sanitizeSpaceMessageContent('\u0000')).toEqual({ ok: false });
    });
  });

  describe('sanitizeClientMessageId', () => {
    test('accepts a UUID', () => {
      expect(sanitizeClientMessageId(VALID_UUID)).toEqual({
        ok: true,
        clientMessageId: VALID_UUID,
      });
    });
    test('lowercases and strips zero-width', () => {
      const messy = `${VALID_UUID.toUpperCase().slice(0, 8)}\u200b${VALID_UUID.toUpperCase().slice(8)}`;
      expect(sanitizeClientMessageId(messy)).toEqual({
        ok: true,
        clientMessageId: VALID_UUID,
      });
    });
    test('rejects non-UUID', () => {
      expect(sanitizeClientMessageId('not-a-uuid')).toEqual({ ok: false });
    });
  });

  describe('sanitizeSpaceRoleName', () => {
    test('undefined passes through (field not updated)', () => {
      expect(sanitizeSpaceRoleName(undefined)).toEqual({ ok: true, name: undefined });
    });
    test('keeps international text and emoji', () => {
      expect(sanitizeSpaceRoleName('Modérateur 🛡️')).toEqual({ ok: true, name: 'Modérateur 🛡️' });
    });
    test('strips template-literal injection', () => {
      const r = sanitizeSpaceRoleName('Admin ${evil}');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.name).not.toContain('${');
    });
    test('rejects empty after sanitize', () => {
      expect(sanitizeSpaceRoleName('\u200b\u0000')).toEqual({ ok: false });
    });
    test('rejects over-long names', () => {
      expect(sanitizeSpaceRoleName('x'.repeat(101))).toEqual({ ok: false });
    });
  });

  describe('sanitizeSpaceChannelName', () => {
    test('undefined passes through', () => {
      expect(sanitizeSpaceChannelName(undefined)).toEqual({ ok: true, name: undefined });
    });
    test('keeps clean names', () => {
      expect(sanitizeSpaceChannelName('general-chat')).toEqual({ ok: true, name: 'general-chat' });
    });
    test('rejects control-character-only names', () => {
      expect(sanitizeSpaceChannelName('\u0000\u200b')).toEqual({ ok: false });
    });
    test('rejects over-long names', () => {
      expect(sanitizeSpaceChannelName('x'.repeat(101))).toEqual({ ok: false });
    });
  });

  describe('sanitizeSpaceNickname', () => {
    test('undefined passes through (not updated)', () => {
      expect(sanitizeSpaceNickname(undefined)).toEqual({ ok: true, nickname: undefined });
    });
    test('null passes through (clears the nickname)', () => {
      expect(sanitizeSpaceNickname(null)).toEqual({ ok: true, nickname: null });
    });
    test('keeps clean nicknames', () => {
      expect(sanitizeSpaceNickname('Cool Cat 😺')).toEqual({ ok: true, nickname: 'Cool Cat 😺' });
    });
    test('strips template injection', () => {
      const r = sanitizeSpaceNickname('nick${x}');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.nickname).not.toContain('${');
    });
    test('rejects nicknames that empty out after sanitize', () => {
      expect(sanitizeSpaceNickname('\u200b')).toEqual({ ok: false });
    });
    test('rejects over-long nicknames', () => {
      expect(sanitizeSpaceNickname('x'.repeat(51))).toEqual({ ok: false });
    });
  });

  describe('sanitizeSpaceBanReason', () => {
    test('keeps real reasons', () => {
      expect(sanitizeSpaceBanReason('Repeated harassment')).toEqual({
        ok: true,
        reason: 'Repeated harassment',
      });
    });
    test('strips control characters and injection', () => {
      const r = sanitizeSpaceBanReason('spam\u0000 ${payload}');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.reason).not.toContain('\u0000');
        expect(r.reason).not.toContain('${');
      }
    });
    test('rejects undefined/empty reasons', () => {
      expect(sanitizeSpaceBanReason(undefined)).toEqual({ ok: false });
      expect(sanitizeSpaceBanReason('\u200b')).toEqual({ ok: false });
    });
    test('rejects over-long reasons', () => {
      expect(sanitizeSpaceBanReason('x'.repeat(501))).toEqual({ ok: false });
    });
  });

  describe('sanitizeSpaceSearchTerm', () => {
    test('undefined when absent', () => {
      expect(sanitizeSpaceSearchTerm(null)).toBeUndefined();
    });
    test('undefined when too long', () => {
      expect(sanitizeSpaceSearchTerm('x'.repeat(101))).toBeUndefined();
    });
    test('returns sanitized term', () => {
      expect(sanitizeSpaceSearchTerm('game night')).toBe('game night');
    });
    test('strips template injection', () => {
      const term = sanitizeSpaceSearchTerm('a${b}');
      expect(term).toBeDefined();
      expect(term).not.toContain('${');
    });
  });
});
