import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

const mockSubmitVpnAttestation = mock(async () => ({ ok: true as const, next: 'continue' as const }));

mock.module('../../services/compliance/compliance-enforcement.service', () => ({
  submitVpnAttestation: mockSubmitVpnAttestation,
}));

import { postVpnAttestationHandler, VpnAttestationSchema } from './controller';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockSubmitVpnAttestation.mockClear();
  mockSubmitVpnAttestation.mockResolvedValue({ ok: true, next: 'continue' });
});

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: new ObjectId(),
    emailVerified: false,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3600000,
    identityLoginAttempts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserDocument;
}

describe('VpnAttestationSchema', () => {
  test('accepts valid payload', () => {
    const parsed = VpnAttestationSchema.safeParse({
      step: 'sanctioned_membership',
      answer: 'no',
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects array body', () => {
    const parsed = VpnAttestationSchema.safeParse([]);
    expect(parsed.success).toBe(false);
  });

  test('rejects answer with zero-width space', () => {
    const parsed = VpnAttestationSchema.safeParse({
      step: 'sanctioned_membership',
      answer: `yes\u200B`,
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects step with null byte', () => {
    const parsed = VpnAttestationSchema.safeParse({
      step: `sanctioned_membership\x00`,
      answer: 'no',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('postVpnAttestationHandler', () => {
  test('returns validation_failed for missing body', async () => {
    const result = await postVpnAttestationHandler('1.2.3.4', makeUser(), undefined);
    expect(result).toEqual({ ok: false, reason: 'validation_failed' });
    expect(mockSubmitVpnAttestation).not.toHaveBeenCalled();
  });

  test('returns validation_failed for array body', async () => {
    const result = await postVpnAttestationHandler('1.2.3.4', makeUser(), []);
    expect(result).toEqual({ ok: false, reason: 'validation_failed' });
    expect(mockSubmitVpnAttestation).not.toHaveBeenCalled();
  });

  test('returns validation_failed for invalid enum values', async () => {
    const result = await postVpnAttestationHandler('1.2.3.4', makeUser(), {
      step: 'invalid',
      answer: 'maybe',
    });
    expect(result).toEqual({ ok: false, reason: 'validation_failed' });
    expect(mockSubmitVpnAttestation).not.toHaveBeenCalled();
  });

  test('returns validation_failed for tampered enum strings', async () => {
    const result = await postVpnAttestationHandler('1.2.3.4', makeUser(), {
      step: 'utah_residency',
      answer: 'no\u200B',
    });
    expect(result).toEqual({ ok: false, reason: 'validation_failed' });
    expect(mockSubmitVpnAttestation).not.toHaveBeenCalled();
  });

  test('delegates valid payload to submitVpnAttestation', async () => {
    const user = makeUser();
    const result = await postVpnAttestationHandler('1.2.3.4', user, {
      step: 'utah_residency',
      answer: 'no',
    });
    expect(result).toEqual({ ok: true, next: 'continue' });
    expect(mockSubmitVpnAttestation).toHaveBeenCalledWith(
      user,
      '1.2.3.4',
      'utah_residency',
      'no',
    );
  });

  test('propagates banned result', async () => {
    mockSubmitVpnAttestation.mockResolvedValueOnce({
      ok: false,
      banned: true,
      silent: true,
    });
    const result = await postVpnAttestationHandler('1.2.3.4', makeUser(), {
      step: 'sanctioned_membership',
      answer: 'yes',
    });
    expect(result).toEqual({ ok: false, banned: true, silent: true });
  });
});
