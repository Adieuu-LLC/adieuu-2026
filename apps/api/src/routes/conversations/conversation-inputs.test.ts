/**
 * Unit tests for conversation input helpers.
 *
 * @module routes/conversations/conversation-inputs.test
 */

import { describe, expect, test } from 'bun:test';
import {
  sanitizeObjectId24,
  parsePinnedListCursor,
  sanitizeCommaSeparatedMessageIds,
  sanitizeParticipantIds,
} from './conversation-inputs';

const VALID_ID = '507f1f77bcf86cd799439011';

describe('conversation-inputs', () => {
  describe('sanitizeObjectId24', () => {
    test('accepts valid hex ObjectId', () => {
      expect(sanitizeObjectId24(VALID_ID)).toEqual({ ok: true, id: VALID_ID });
    });

    test('strips zero-width characters and validates cleaned id', () => {
      const withZw = `${VALID_ID.slice(0, 12)}\u200b${VALID_ID.slice(12)}`;
      expect(sanitizeObjectId24(withZw)).toEqual({ ok: true, id: VALID_ID });
    });

    test('rejects when stripping leaves invalid id length', () => {
      const broken = `${VALID_ID.slice(0, 11)}\u200b${VALID_ID.slice(11, 23)}`;
      expect(sanitizeObjectId24(broken)).toEqual({ ok: false });
    });

    test('rejects non-ObjectId garbage', () => {
      expect(sanitizeObjectId24('not-an-object-id!!!')).toEqual({ ok: false });
    });
  });

  describe('parsePinnedListCursor', () => {
    test('returns undefined when absent or blank', () => {
      expect(parsePinnedListCursor(null)).toEqual({ ok: true, cursor: undefined });
      expect(parsePinnedListCursor('  ')).toEqual({ ok: true, cursor: undefined });
    });

    test('accepts valid cursor', () => {
      expect(parsePinnedListCursor(VALID_ID)).toEqual({ ok: true, cursor: VALID_ID });
    });

    test('rejects invalid cursor', () => {
      const r = parsePinnedListCursor('zzzzzzzzzzzzzzzzzzzzzzzz');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toBe('Invalid cursor.');
    });
  });

  describe('sanitizeCommaSeparatedMessageIds', () => {
    test('requires param', () => {
      const r = sanitizeCommaSeparatedMessageIds(null);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('required');
    });

    test('rejects empty list', () => {
      const r = sanitizeCommaSeparatedMessageIds(',,');
      expect(r.ok).toBe(false);
    });

    test('sanitizes each id', () => {
      const r = sanitizeCommaSeparatedMessageIds(`${VALID_ID},${VALID_ID}`);
      expect(r).toEqual({ ok: true, ids: [VALID_ID, VALID_ID] });
    });
  });

  describe('sanitizeParticipantIds', () => {
    test('maps valid ids', () => {
      expect(sanitizeParticipantIds([VALID_ID])).toEqual({ ok: true, ids: [VALID_ID] });
    });

    test('fails on any invalid', () => {
      expect(sanitizeParticipantIds([VALID_ID, 'bad'])).toEqual({ ok: false });
    });
  });
});
