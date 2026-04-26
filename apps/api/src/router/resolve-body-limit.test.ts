import { describe, expect, test } from 'bun:test';
import { pathAllowsFullBodyWithoutSession, STRIPE_WEBHOOK_PATH } from './resolve-body-limit';

describe('pathAllowsFullBodyWithoutSession', () => {
  test('allows Stripe webhook path only', () => {
    expect(pathAllowsFullBodyWithoutSession(STRIPE_WEBHOOK_PATH)).toBe(true);
  });

  test('rejects other paths', () => {
    expect(pathAllowsFullBodyWithoutSession('/api/webhooks/stripe/extra')).toBe(false);
    expect(pathAllowsFullBodyWithoutSession('/api/conversations/abc/messages')).toBe(false);
    expect(pathAllowsFullBodyWithoutSession('')).toBe(false);
  });
});
