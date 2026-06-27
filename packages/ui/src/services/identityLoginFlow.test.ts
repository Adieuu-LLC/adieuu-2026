import { describe, expect, test } from 'bun:test';
import { resolveLoginFailure } from './identityLoginFlow';

describe('identityLoginFlow', () => {
  test('maps lockout responses', () => {
    const result = resolveLoginFailure('Account locked', 'LOCKED_OUT');
    expect(result.result.errorCode).toBe('LOCKED_OUT');
  });

  test('maps suspension responses with moderation info', () => {
    const result = resolveLoginFailure('Suspended', 'IDENTITY_SUSPENDED', {
      moderationReason: 'spam',
      moderationReportId: 'r-1',
    });
    expect(result.suspensionInfo?.type).toBe('suspended');
    expect(result.result.errorCode).toBe('IDENTITY_SUSPENDED');
  });
});
