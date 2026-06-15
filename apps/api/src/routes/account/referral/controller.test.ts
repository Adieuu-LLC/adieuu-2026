/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

const mockGetReferralStats = mock((): any => Promise.resolve(null));
const mockCreateReferralCode = mock((): any => Promise.resolve({ ok: false, reason: 'validation' }));
const mockUpdateReferralCode = mock((): any => Promise.resolve({ ok: false, reason: 'validation' }));
const mockDeleteReferralCode = mock((): any => Promise.resolve({ ok: false, reason: 'validation' }));
const mockRedeemReferralCode = mock((): any => Promise.resolve({ ok: false, reason: 'validation' }));

mock.module('../../../services/referral.service', () => ({
  getReferralStats: mockGetReferralStats,
  createReferralCode: mockCreateReferralCode,
  updateReferralCode: mockUpdateReferralCode,
  deleteReferralCode: mockDeleteReferralCode,
  redeemReferralCode: mockRedeemReferralCode,
}));

const {
  getReferralStatsForUser,
  createReferralCodeForUser,
  redeemReferralCodeForUser,
} = await import('./controller');

describe('account referral controller', () => {
  beforeEach(() => {
    mockGetReferralStats.mockClear();
    mockCreateReferralCode.mockClear();
    mockRedeemReferralCode.mockClear();
  });

  test('getReferralStatsForUser returns stats payload', async () => {
    mockGetReferralStats.mockResolvedValueOnce({
      codes: [],
      totalSignups: 0,
      totalSubscriptions: 0,
      hasBeenReferred: false,
    });

    const result = await getReferralStatsForUser(new ObjectId().toHexString());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.totalSignups).toBe(0);
  });

  test('createReferralCodeForUser maps service success', async () => {
    mockCreateReferralCode.mockResolvedValueOnce({
      ok: true,
      code: {
        id: '1',
        code: 'abc',
        useCount: 0,
        signupCount: 0,
        subscriptionCount: 0,
        createdAt: new Date().toISOString(),
      },
    });

    const result = await createReferralCodeForUser(new ObjectId().toHexString(), { code: 'abc' });
    expect(result.ok).toBe(true);
  });

  test('redeemReferralCodeForUser maps service success', async () => {
    mockRedeemReferralCode.mockResolvedValueOnce({
      ok: true,
      code: 'abc',
      attributedAt: new Date().toISOString(),
    });

    const result = await redeemReferralCodeForUser(new ObjectId().toHexString(), 'abc');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.code).toBe('abc');
  });
});
