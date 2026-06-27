import { describe, expect, test } from 'bun:test';
import {
  FEEDBACK_STATUSES,
  getFeedbackListDefaultStatuses,
  isFeedbackStatus,
  isRoadmapTimelineStatus,
} from './feedback';

describe('feedback constants', () => {
  test('includes closed status', () => {
    expect(FEEDBACK_STATUSES).toContain('closed');
    expect(isFeedbackStatus('closed')).toBe(true);
  });

  test('roadmap timeline excludes submitted and closed', () => {
    expect(isRoadmapTimelineStatus('planned')).toBe(true);
    expect(isRoadmapTimelineStatus('released')).toBe(true);
    expect(isRoadmapTimelineStatus('submitted')).toBe(false);
    expect(isRoadmapTimelineStatus('closed')).toBe(false);
  });

  test('default list statuses exclude released and closed', () => {
    const defaults = getFeedbackListDefaultStatuses();
    expect(defaults).not.toContain('released');
    expect(defaults).not.toContain('closed');
    expect(defaults).toContain('submitted');
  });
});
