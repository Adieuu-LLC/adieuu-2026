/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the silent background email age check triggered after subscription checkout.
 */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';
import type { StartVerificationResult } from './provider';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStartVerification = mock(async (_input: unknown): Promise<StartVerificationResult> => ({
  verificationId: 'pv-bg-123',
  status: 'started',
  redirectUrl: 'https://verify.example.com/flow/pv-bg-123',
}));

mock.module('./providers', () => ({
  getActiveProvider: () => Promise.resolve({
    id: 'verifymy',
    startVerification: mockStartVerification,
    getVerificationStatus: mock(() => Promise.resolve({ verificationId: 'pv-bg-123', status: 'pending' })),
  }),
}));

const mockIsAgeVerificationEnabled = mock(() => Promise.resolve(true)) as AnyMock;
const mockIsAutoEmailBackgroundCheckEnabled = mock(() => Promise.resolve(true)) as AnyMock;

const mockGetAgeVerificationPolicy = mock(async (_j: string) => ({
  required: true,
  compatibleMethods: ['Email', 'AgeEstimation'],
  leastInvasiveMethod: 'Email',
  legislation: [],
})) as AnyMock;

const mockResolveBusinessSettings = mock((_jurisdiction: string, _policy: unknown) =>
  Promise.resolve({ id: 'test-settings-id', country: 'US' }),
) as AnyMock;
const mockResolveBusinessSettingsId = mock((id: string | undefined) => Promise.resolve(id)) as AnyMock;

mock.module('./jurisdiction-policy', () => ({
  getAgeVerificationPolicy: mockGetAgeVerificationPolicy,
  resolveBusinessSettings: mockResolveBusinessSettings,
  resolveBusinessSettingsId: mockResolveBusinessSettingsId,
}));

mock.module('./av-settings', () => ({
  isAgeVerificationEnabled: mockIsAgeVerificationEnabled,
  isAutoEmailBackgroundCheckEnabled: mockIsAutoEmailBackgroundCheckEnabled,
  getBlockedJurisdictions: mock(() => Promise.resolve(new Set<string>())),
  getLawLinkForJurisdiction: mock((_jurisdiction: string) => Promise.resolve(undefined as string | undefined)),
  getRequiredMode: mock(() => Promise.resolve('jurisdictions' as const)),
}));

const mockCreateVerification = mock(async (input: unknown) => ({
  _id: new ObjectId(),
  ...(input as Record<string, unknown>),
  createdAt: new Date(),
  updatedAt: new Date(),
})) as AnyMock;
const mockUpdateStatus = mock(async () => {}) as AnyMock;

mock.module('../../repositories/age-verification.repository', () => ({
  getAgeVerificationRepository: () => ({
    createVerification: mockCreateVerification,
    updateStatus: mockUpdateStatus,
  }),
}));

const mockUpdateAgeVerification = mock(async () => {}) as AnyMock;

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    updateAgeVerification: mockUpdateAgeVerification,
  }),
}));

mock.module('../../config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.com',
    verifymy: {
      apiKey: 'key',
      apiSecret: 'secret',
      environment: 'sandbox' as const,
      sandboxBaseUrl: 'https://sandbox.verifymyage.com',
      productionBaseUrl: 'https://oauth.verifymyage.com',
      timeoutMs: 10_000,
    },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

const { initiateBackgroundCheck } = await import('./background-check.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_OID = new ObjectId('000000000000000000000001');

function makeUser(overrides?: Partial<UserDocument>): UserDocument {
  return {
    _id: USER_OID,
    email: 'new-user@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    maxIdentities: 2,
    geo: { jurisdiction: 'US-CA', countryCode: 'US', checkedAt: new Date() },
    ...overrides,
  } as UserDocument;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initiateBackgroundCheck', () => {
  beforeEach(() => {
    mockStartVerification.mockReset();
    mockIsAgeVerificationEnabled.mockReset();
    mockIsAutoEmailBackgroundCheckEnabled.mockClear();
    mockGetAgeVerificationPolicy.mockReset();
    mockCreateVerification.mockReset();
    mockUpdateStatus.mockReset();
    mockUpdateAgeVerification.mockReset();

    mockIsAgeVerificationEnabled.mockResolvedValue(true);
    mockIsAutoEmailBackgroundCheckEnabled.mockImplementation(async () => true);
    mockGetAgeVerificationPolicy.mockImplementation(async () => ({
      required: true,
      compatibleMethods: ['Email', 'AgeEstimation'],
      leastInvasiveMethod: 'Email',
      legislation: [],
    }));
    mockStartVerification.mockImplementation(async () => ({
      verificationId: 'pv-bg-123',
      status: 'started' as const,
      redirectUrl: 'https://verify.example.com/flow/pv-bg-123',
    }));
    mockCreateVerification.mockImplementation(async (input: unknown) => ({
      _id: new ObjectId(),
      ...(input as Record<string, unknown>),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  test('sends email to provider and creates verification doc', async () => {
    const user = makeUser();
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).toHaveBeenCalledTimes(1);
    const callArgs = mockStartVerification.mock.calls[0]![0] as { userInfo?: { email?: string } };
    expect(callArgs.userInfo?.email).toBe('new-user@example.com');

    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
    const createArg = mockCreateVerification.mock.calls[0]![0] as any;
    expect(createArg.backgroundOnly).toBe(true);
  });

  test('updates user to verified on immediate approval', async () => {
    mockStartVerification.mockImplementation(async () => ({
      verificationId: 'pv-instant',
      status: 'approved' as const,
    }));

    const user = makeUser();
    await initiateBackgroundCheck(user);

    expect(mockUpdateAgeVerification).toHaveBeenCalledTimes(1);
    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as any;
    expect(avUpdate.status).toBe('verified');

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
  });

  test('sets user to pending when background check is inconclusive', async () => {
    const user = makeUser();
    await initiateBackgroundCheck(user);

    expect(mockUpdateAgeVerification).toHaveBeenCalledTimes(1);
    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as any;
    expect(avUpdate.status).toBe('pending');
  });

  test('does nothing when automatic email background check is disabled', async () => {
    mockIsAutoEmailBackgroundCheckEnabled.mockImplementation(async () => false);

    const user = makeUser();
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('does nothing when AV is disabled', async () => {
    mockIsAgeVerificationEnabled.mockResolvedValue(false);

    const user = makeUser();
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('does nothing when user has no email', async () => {
    const user = makeUser({ email: undefined });
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('does nothing when user is already verified', async () => {
    const user = makeUser({
      ageVerification: { status: 'verified', verifiedAt: new Date(), expirationCount: 0 },
    });
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('does nothing when user already has pending verification', async () => {
    const user = makeUser({
      ageVerification: { status: 'pending', providerVerificationId: 'pv-existing', expirationCount: 0 },
    });
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('does not throw when provider call fails', async () => {
    mockStartVerification.mockImplementation(async () => {
      throw new Error('Network error');
    });

    const user = makeUser();
    await expect(initiateBackgroundCheck(user)).resolves.toBeUndefined();
  });

  test('passes businessSettingsId from jurisdiction policy to provider', async () => {
    mockResolveBusinessSettings.mockImplementation(async () => ({
      id: 'bs-ca-789',
      country: 'US',
    }));

    const user = makeUser();
    await initiateBackgroundCheck(user);

    expect(mockStartVerification).toHaveBeenCalledTimes(1);
    const callArgs = mockStartVerification.mock.calls[0]![0] as { businessSettingsId?: string };
    expect(callArgs.businessSettingsId).toBe('bs-ca-789');
  });

  test('sends undefined businessSettingsId when policy has none', async () => {
    mockResolveBusinessSettings.mockImplementation(async () => undefined);

    const user = makeUser();
    await initiateBackgroundCheck(user);

    const callArgs = mockStartVerification.mock.calls[0]![0] as { businessSettingsId?: string };
    expect(callArgs.businessSettingsId).toBeUndefined();
  });
});
