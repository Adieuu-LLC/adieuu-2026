import { describe, it, expect } from 'bun:test';
import {
  mapModerationReasonToUserMessage,
  normalizeModerationReasonKey,
} from './moderation-reason-map';

describe('moderation-reason-map', () => {
  it('normalizes content_moderation prefix', () => {
    expect(normalizeModerationReasonKey('content_moderation: Explicit Nudity')).toBe('Explicit Nudity');
    expect(normalizeModerationReasonKey('  content_moderation:   Violence  ')).toBe('Violence');
  });

  it('maps known patterns to friendly messages', () => {
    expect(mapModerationReasonToUserMessage('content_moderation: Explicit Nudity')).toContain('sexual');
    expect(mapModerationReasonToUserMessage('content_moderation: Explicit Nudity')).toContain('media');
    expect(mapModerationReasonToUserMessage('content_moderation: Violence')).toContain('violence');
    expect(mapModerationReasonToUserMessage('content_moderation: Child')).toContain('minors');
  });

  it('returns null for empty input', () => {
    expect(mapModerationReasonToUserMessage(null)).toBeNull();
    expect(mapModerationReasonToUserMessage('')).toBeNull();
    expect(mapModerationReasonToUserMessage('   ')).toBeNull();
  });

  it('falls back to generic policy message for unknown labels', () => {
    const msg = mapModerationReasonToUserMessage('content_moderation: UnknownLabel123');
    expect(msg).toContain('content policy');
    expect(msg).toContain('media');
  });

  it('maps drug-related hints without echoing raw label', () => {
    const msg = mapModerationReasonToUserMessage('content_moderation: Drugs');
    expect(msg).toContain('not allowed');
    expect(msg).not.toMatch(/Drugs/i);
  });

  it('maps hate-related hints', () => {
    const msg = mapModerationReasonToUserMessage('content_moderation: Hate Symbols');
    expect(msg).toContain('offensive');
  });
});
