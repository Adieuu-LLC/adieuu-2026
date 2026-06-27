import { describe, expect, test } from 'bun:test';
import { resolveTheme } from './themeResolve';

describe('themeResolve', () => {
  test('returns custom theme when id matches custom list', () => {
    const custom = [{ id: 'custom-1', name: 'Custom' }];
    const resolved = resolveTheme('custom-1', custom as never);
    expect(resolved?.id).toBe('custom-1');
  });
});
