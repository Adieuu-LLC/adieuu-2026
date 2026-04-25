import { describe, expect, test } from 'bun:test';
import { mergeSeekTimesForVideoCapture } from './videoProcessing';

describe('mergeSeekTimesForVideoCapture', () => {
  test('merges seek times within 250ms, preserves longer gaps', () => {
    const end = 10;
    expect(mergeSeekTimesForVideoCapture([0, 0.1, 0.2, 1.0, 1.1, 3.0], end)).toEqual([0, 1.0, 3.0]);
  });
});
