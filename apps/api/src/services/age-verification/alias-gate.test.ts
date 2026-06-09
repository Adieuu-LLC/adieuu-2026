import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { UserDocument } from '../../models/user';
import type { ObjectId } from 'mongodb';

// Mock dependencies before importing the module under test
const mockIsAgeVerificationEnabled = mock(() => Promise.resolve(true));
const mockGetBlockedJurisdictions = mock(() => Promise.resolve(new Set<string>()));
const mockGetLawLinkForJurisdiction = mock((_j: string) => Promise.resolve(undefined as string | undefined));
const mockGetRequiredMode = mock(() => Promise.resolve('jurisdictions' as 'jurisdictions' | 'all'));
const mockRequiresAgeVerification = mock((_j: string) => Promise.resolve(false));
const mockGetAgeVerificationPolicy = mock((_j: string) => Promise.resolve(null as null | { leastInvasiveMethod: string }));

const mockIsAutoEmailBackgroundCheckEnabled = mock(() => Promise.resolve(false));

mock.module('./av-settings', () => ({
  isAgeVerificationEnabled: mockIsAgeVerificationEnabled,
  isAutoEmailBackgroundCheckEnabled: mockIsAutoEmailBackgroundCheckEnabled,
  getBlockedJurisdictions: mockGetBlockedJurisdictions,
  getLawLinkForJurisdiction: mockGetLawLinkForJurisdiction,
  getRequiredMode: mockGetRequiredMode,
}));

mock.module('./jurisdiction-policy', () => ({
  requiresAgeVerification: mockRequiresAgeVerification,
  getAgeVerificationPolicy: mockGetAgeVerificationPolicy,
}));

const { evaluateAliasGate } = await import('./alias-gate');

function makeUser(overrides?: Partial<UserDocument>): UserDocument {
  return {
    _id: '000000000000000000000001' as unknown as ObjectId,
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    maxIdentities: 2,
    ...overrides,
  } as UserDocument;
}

beforeEach(() => {
  mockIsAgeVerificationEnabled.mockReset();
  mockIsAutoEmailBackgroundCheckEnabled.mockReset();
  mockGetBlockedJurisdictions.mockReset();
  mockGetLawLinkForJurisdiction.mockReset();
  mockGetRequiredMode.mockReset();
  mockRequiresAgeVerification.mockReset();
  mockGetAgeVerificationPolicy.mockReset();

  mockIsAgeVerificationEnabled.mockImplementation(() => Promise.resolve(true));
  mockIsAutoEmailBackgroundCheckEnabled.mockImplementation(() => Promise.resolve(false));
  mockGetBlockedJurisdictions.mockImplementation(() => Promise.resolve(new Set<string>()));
  mockGetLawLinkForJurisdiction.mockImplementation(() => Promise.resolve(undefined));
  mockGetRequiredMode.mockImplementation(() => Promise.resolve('jurisdictions' as const));
  mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(false));
  mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve(null));
});

describe('evaluateAliasGate', () => {
  test('allows when feature is disabled', async () => {
    mockIsAgeVerificationEnabled.mockImplementation(() => Promise.resolve(false));
    const result = await evaluateAliasGate(makeUser({ geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() } }));
    expect(result.allowed).toBe(true);
  });

  test('allows when jurisdiction is unresolved (no geo) and mode is jurisdictions', async () => {
    const result = await evaluateAliasGate(makeUser());
    expect(result.allowed).toBe(true);
  });

  test('allows when jurisdiction is unresolved (geo without jurisdiction) and mode is jurisdictions', async () => {
    const result = await evaluateAliasGate(makeUser({ geo: { countryCode: '', ipHash: '', checkedAt: new Date() } as any }));
    expect(result.allowed).toBe(true);
  });

  test('requires AV when jurisdiction is unresolved and mode is all', async () => {
    mockGetRequiredMode.mockImplementation(() => Promise.resolve('all' as const));
    mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve({ leastInvasiveMethod: 'Email' }));
    const result = await evaluateAliasGate(makeUser());
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('AGE_VERIFICATION_REQUIRED');
      if (result.code === 'AGE_VERIFICATION_REQUIRED') {
        expect(result.jurisdiction).toBe('UNRESOLVED');
      }
    }
  });

  test('allows verified user with unresolved jurisdiction when mode is all', async () => {
    mockGetRequiredMode.mockImplementation(() => Promise.resolve('all' as const));
    const user = makeUser({
      ageVerification: { status: 'verified', verifiedAt: new Date(), expirationCount: 0 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(true);
  });

  test('blocks geofenced jurisdiction', async () => {
    mockGetBlockedJurisdictions.mockImplementation(() => Promise.resolve(new Set(['US-TX'])));
    mockGetLawLinkForJurisdiction.mockImplementation(() => Promise.resolve('https://law.example.com'));
    const user = makeUser({ geo: { jurisdiction: 'US-TX', countryCode: 'US', ipHash: '', checkedAt: new Date() } });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.code === 'GEOFENCE_BLOCKED') {
      expect(result.lawUrl).toBe('https://law.example.com');
    }
  });

  test('allows verified user in AV-required jurisdiction', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'verified', verifiedAt: new Date(), expirationCount: 0 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(true);
  });

  test('requires AV for unverified user in AV-required jurisdiction', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve({ leastInvasiveMethod: 'Email' }));
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.code === 'AGE_VERIFICATION_REQUIRED') {
      expect(result.leastInvasiveMethod).toBe('Email');
    }
  });

  test('blocks failed user with 30-day cooldown', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    const failedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'failed', failedAt, expirationCount: 0 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.code === 'AGE_VERIFICATION_FAILED') {
      expect(result.retryAfter.getTime()).toBeGreaterThan(Date.now());
    }
  });

  test('allows retry after 30-day cooldown elapses for failed', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve({ leastInvasiveMethod: 'Email' }));
    const failedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'failed', failedAt, expirationCount: 0 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('AGE_VERIFICATION_REQUIRED');
    }
  });

  test('blocks expired user (1st) with 24h cooldown', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    const lastExpiredAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'expired', lastExpiredAt, expirationCount: 1 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('AGE_VERIFICATION_COOLDOWN');
    }
  });

  test('blocks 3+ expirations with 30-day cooldown', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    const lastExpiredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'expired', lastExpiredAt, expirationCount: 3 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.code === 'AGE_VERIFICATION_COOLDOWN') {
      expect(result.retryAfter.getTime()).toBeGreaterThan(Date.now() + 27 * 24 * 60 * 60 * 1000);
    }
  });

  test('allows after 24h cooldown elapses for expired (< 3)', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve({ leastInvasiveMethod: 'Email' }));
    const lastExpiredAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'expired', lastExpiredAt, expirationCount: 1 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('AGE_VERIFICATION_REQUIRED');
    }
  });

  test('allows when jurisdiction does not require AV', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(false));
    const user = makeUser({
      geo: { jurisdiction: 'US-CA', countryCode: 'US', ipHash: '', checkedAt: new Date() },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(true);
  });

  test('allows opted-in verified user', async () => {
    mockRequiresAgeVerification.mockImplementation(() => Promise.resolve(true));
    const user = makeUser({
      geo: { jurisdiction: 'US-TN', countryCode: 'US', ipHash: '', checkedAt: new Date() },
      ageVerification: { status: 'verified', verifiedAt: new Date(), optedIn: true, expirationCount: 0 },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(true);
  });

  test('requires AV when abusive_ip requiredReason is set', async () => {
    mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve({ leastInvasiveMethod: 'Email' }));
    const user = makeUser({
      ageVerification: {
        status: 'unverified',
        expirationCount: 0,
        requiredReason: 'abusive_ip',
      },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('AGE_VERIFICATION_REQUIRED');
      expect(result.requiredReason).toBe('abusive_ip');
    }
  });

  test('requires AV for attested Utah residency', async () => {
    mockGetAgeVerificationPolicy.mockImplementation(() => Promise.resolve({ leastInvasiveMethod: 'Email' }));
    const user = makeUser({
      compliance: { attestedUtahResidency: true },
    });
    const result = await evaluateAliasGate(user);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('AGE_VERIFICATION_REQUIRED');
      expect(result.jurisdiction).toBe('US-UT');
      expect(result.requiredReason).toBe('utah_attestation');
    }
  });
});
