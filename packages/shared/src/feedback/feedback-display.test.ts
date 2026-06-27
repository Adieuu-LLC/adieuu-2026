import { describe, expect, test } from 'bun:test';
import { shouldShowFeedbackAuthorCredit } from './feedback-display';

describe('shouldShowFeedbackAuthorCredit', () => {
  test('hides author for official roadmap entries', () => {
    expect(shouldShowFeedbackAuthorCredit({ isRoadmapOfficial: true, isStaffAuthored: false })).toBe(false);
  });

  test('hides author for staff-authored entries', () => {
    expect(shouldShowFeedbackAuthorCredit({ isRoadmapOfficial: false, isStaffAuthored: true })).toBe(false);
  });

  test('shows author for community submissions', () => {
    expect(shouldShowFeedbackAuthorCredit({ isRoadmapOfficial: false, isStaffAuthored: false })).toBe(true);
  });
});
