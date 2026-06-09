import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

const mockBanAccount = mock(() => Promise.resolve());
const mockRevokeAll = mock(() => Promise.resolve());
const mockUpdateAge = mock(() => Promise.resolve());
const mockUpdateCompliance = mock(() => Promise.resolve());
const mockAuditCreate = mock(() => Promise.resolve());
const mockFindAllActive = mock(() =>
  Promise.resolve([
    { countryCode: 'IR', countryName: 'Iran', active: true },
  ]),
);
const mockRefreshGeo = mock((_user: UserDocument, _ip: string) =>
  Promise.resolve({
    jurisdiction: 'IR',
    countryCode: 'IR',
    ipHash: 'hash',
    checkedAt: new Date(),
  }),
);
const mockSendNotification = mock(() => Promise.resolve());

mock.module('../../config', () => ({
  config: { security: { accountHashSecret: 'test' } },
}));

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    banAccount: mockBanAccount,
    updateAgeVerification: mockUpdateAge,
    updateCompliance: mockUpdateCompliance,
  }),
}));

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: () => ({
    revokeAllForUser: mockRevokeAll,
  }),
}));

mock.module('../../repositories/audit.repository', () => ({
  getAuditLogRepository: () => ({
    create: mockAuditCreate,
  }),
}));

mock.module('../../repositories/sanctioned-country.repository', () => ({
  getSanctionedCountryRepository: () => ({
    findAllActive: mockFindAllActive,
  }),
}));

mock.module('../geo/geo.service', () => ({
  hashIpForGeo: () => 'ip-hash',
  refreshUserGeoIfStale: mockRefreshGeo,
}));

mock.module('./compliance-notification', () => ({
  sendAbusiveIpAccessNotification: mockSendNotification,
}));

mock.module('../../db/redis', () => ({
  getRedis: () => ({ get: mock(() => Promise.resolve(null)), set: mock(() => Promise.resolve('OK')) }),
  isRedisConnected: () => false,
  RedisKeys: { sanctionedCountries: () => 'compliance:sanctioned' },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

import {
  evaluateComplianceOnAccess,
  handleAbusiveIpAccess,
  submitVpnAttestation,
} from './compliance-enforcement.service';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockBanAccount.mockClear();
  mockRevokeAll.mockClear();
  mockUpdateAge.mockClear();
  mockRefreshGeo.mockClear();
  mockSendNotification.mockClear();
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

describe('evaluateComplianceOnAccess', () => {
  test('bans user when geo country is sanctioned', async () => {
    const user = makeUser();
    const result = await evaluateComplianceOnAccess(user, '1.2.3.4');
    expect(result.action).toBe('ofac_banned');
    expect(mockBanAccount).toHaveBeenCalled();
    expect(mockRevokeAll).toHaveBeenCalled();
  });

  test('blocks abusive IP and flags AV when unverified', async () => {
    mockRefreshGeo.mockImplementationOnce(() =>
      Promise.resolve({
        jurisdiction: 'US-TN',
        countryCode: 'US',
        ipHash: 'hash',
        checkedAt: new Date(),
        isAbuser: true,
      }),
    );
    const user = makeUser();
    const result = await evaluateComplianceOnAccess(user, '1.2.3.4');
    expect(result.action).toBe('abusive_ip_blocked');
    expect(mockUpdateAge).toHaveBeenCalled();
    expect(mockRevokeAll).toHaveBeenCalled();
  });

  test('requires VPN attestation for anonymous IP', async () => {
    mockRefreshGeo.mockImplementationOnce(() =>
      Promise.resolve({
        jurisdiction: 'US-TN',
        countryCode: 'US',
        ipHash: 'hash',
        checkedAt: new Date(),
        isAnonymous: true,
      }),
    );
    const user = makeUser();
    const result = await evaluateComplianceOnAccess(user, '1.2.3.4');
    expect(result.action).toBe('attestation_required');
    if (result.action === 'attestation_required') {
      expect(result.step).toBe('sanctioned_membership');
      expect(mockUpdateCompliance).toHaveBeenCalled();
    }
  });
});

describe('handleAbusiveIpAccess', () => {
  test('skips AV flag when already verified', async () => {
    const user = makeUser({
      ageVerification: { status: 'verified', expirationCount: 0, verifiedAt: new Date() },
    });
    await handleAbusiveIpAccess(user, 'ip-hash');
    expect(mockUpdateAge).not.toHaveBeenCalled();
    expect(mockSendNotification).toHaveBeenCalled();
  });
});

describe('submitVpnAttestation', () => {
  test('silent ban when user attests sanctioned membership', async () => {
    const user = makeUser({
      compliance: {
        vpnAttestationPending: {
          ipHash: 'ip-hash',
          step: 'sanctioned_membership',
          detectedAt: new Date(),
        },
      },
    });
    const result = await submitVpnAttestation(user, '1.2.3.4', 'sanctioned_membership', 'yes');
    expect(result.ok).toBe(false);
    if (!result.ok && 'banned' in result) {
      expect(result.banned).toBe(true);
      expect(result.silent).toBe(true);
    }
    expect(mockBanAccount).toHaveBeenCalled();
  });
});
