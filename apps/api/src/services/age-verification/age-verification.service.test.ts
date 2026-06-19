import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';
import type { AgeVerificationDocument } from '../../models/age-verification';
import type { StartVerificationResult, VerificationStatusResult } from './provider';

const mockStartVerification = mock(async (_input: unknown): Promise<StartVerificationResult> => ({
  verificationId: 'pv-123',
  status: 'started',
  redirectUrl: 'https://verify.verifymyage.com/flow/pv-123',
}));
const mockGetVerificationStatus = mock(async (_id: string): Promise<VerificationStatusResult> => ({
  verificationId: 'pv-123',
  status: 'pending',
}));

mock.module('./providers', () => ({
  getActiveProvider: () => Promise.resolve({
    id: 'verifymy',
    startVerification: mockStartVerification,
    getVerificationStatus: mockGetVerificationStatus,
  }),
}));

const mockGetAgeVerificationPolicy = mock((_j: string) => Promise.resolve({
  required: true,
  compatibleMethods: ['Email', 'AgeEstimation'],
  leastInvasiveMethod: 'Email',
  legislation: [],
}));
mock.module('./jurisdiction-policy', () => ({
  getAgeVerificationPolicy: mockGetAgeVerificationPolicy,
}));

const mockCreateVerification = mock(async (input: unknown) => ({
  _id: new ObjectId(),
  ...(input as Record<string, unknown>),
  createdAt: new Date(),
  updatedAt: new Date(),
}));
const mockFindByProviderVerificationId = mock(async (_id: string): Promise<AgeVerificationDocument | null> => null);
const mockFindByUserIdAndStatus = mock(async (): Promise<AgeVerificationDocument[]> => []);
const mockUpdateStatus = mock(async () => {});

mock.module('../../repositories/age-verification.repository', () => ({
  getAgeVerificationRepository: () => ({
    createVerification: mockCreateVerification,
    findByProviderVerificationId: mockFindByProviderVerificationId,
    findByUserIdAndStatus: mockFindByUserIdAndStatus,
    updateStatus: mockUpdateStatus,
  }),
}));

const mockUpdateAgeVerification = mock(async (..._args: unknown[]) => {});
const mockFindById = mock(async (_id: string | ObjectId) => null as UserDocument | null);

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    updateAgeVerification: mockUpdateAgeVerification,
    findById: mockFindById,
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
  default: { warn: () => {}, error: () => {}, info: () => {} },
}));

const { startVerification, checkVerificationStatus } = await import('./age-verification.service');

const USER_OID = new ObjectId('000000000000000000000001');

function makeUser(overrides?: Partial<UserDocument>): UserDocument {
  return {
    _id: USER_OID,
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    maxIdentities: 2,
    geo: { jurisdiction: 'US-CA', countryCode: 'US' },
    ...overrides,
  } as UserDocument;
}

beforeEach(() => {
  mockStartVerification.mockReset();
  mockGetVerificationStatus.mockReset();
  mockGetAgeVerificationPolicy.mockReset();
  mockCreateVerification.mockReset();
  mockFindByProviderVerificationId.mockReset();
  mockFindByUserIdAndStatus.mockReset();
  mockUpdateStatus.mockReset();
  mockUpdateAgeVerification.mockReset();
  mockFindById.mockReset();

  mockStartVerification.mockImplementation(async () => ({
    verificationId: 'pv-123',
    status: 'started' as const,
    redirectUrl: 'https://verify.verifymyage.com/flow/pv-123',
  }));
  mockGetVerificationStatus.mockImplementation(async () => ({
    verificationId: 'pv-123',
    status: 'pending' as const,
  }));
  mockGetAgeVerificationPolicy.mockImplementation(async () => ({
    required: true,
    compatibleMethods: ['Email', 'AgeEstimation'],
    leastInvasiveMethod: 'Email',
    legislation: [],
  }));
  mockFindByUserIdAndStatus.mockImplementation(async () => []);
  mockCreateVerification.mockImplementation(async (input: unknown) => ({
    _id: new ObjectId(),
    ...(input as Record<string, unknown>),
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as AgeVerificationDocument);
});

describe('startVerification', () => {
  test('includes user_info when user has email and sets backgroundCheckAttempted', async () => {
    const user = makeUser({ email: 'user@example.com' });

    const result = await startVerification(user, {
      jurisdiction: 'US-CA',
      callbackBaseUrl: 'https://api.example.com',
    });

    expect(result.status).toBe('started');
    expect(result.redirectUrl).toBe('https://verify.verifymyage.com/flow/pv-123');
    expect(result.backgroundCheckAttempted).toBe(true);

    const callArgs = mockStartVerification.mock.calls[0]![0] as { userInfo?: { email?: string; phone?: string }; method?: string };
    expect(callArgs.userInfo?.email).toBe('user@example.com');
    expect(callArgs.method).toBe('Email');
  });

  test('sends user_info regardless of compatible methods when user has email', async () => {
    mockGetAgeVerificationPolicy.mockImplementation(async () => ({
      required: true,
      compatibleMethods: ['AgeEstimation', 'IDScanFaceMatch'],
      leastInvasiveMethod: 'AgeEstimation',
      legislation: [],
    }));

    const user = makeUser({ email: 'user@example.com' });

    await startVerification(user, {
      jurisdiction: 'DE',
      callbackBaseUrl: 'https://api.example.com',
    });

    const callArgs = mockStartVerification.mock.calls[0]![0] as { userInfo?: { email?: string } };
    expect(callArgs.userInfo?.email).toBe('user@example.com');
  });

  test('skips user_info when user has no email and sets backgroundCheckAttempted false', async () => {
    const user = makeUser({ email: undefined });

    const result = await startVerification(user, {
      jurisdiction: 'US-CA',
      callbackBaseUrl: 'https://api.example.com',
    });

    expect(result.backgroundCheckAttempted).toBe(false);

    const callArgs = mockStartVerification.mock.calls[0]![0] as { userInfo?: unknown };
    expect(callArgs.userInfo).toBeUndefined();
  });

  test('passes businessSettingsId from policy to provider', async () => {
    mockGetAgeVerificationPolicy.mockImplementation(async () => ({
      required: true,
      compatibleMethods: ['Email', 'AgeEstimation'],
      leastInvasiveMethod: 'Email',
      legislation: [],
      vmyBusinessSettingsId: 'bs-ca-456',
    }));

    const user = makeUser();
    await startVerification(user, {
      jurisdiction: 'US-CA',
      callbackBaseUrl: 'https://api.example.com',
    });

    const callArgs = mockStartVerification.mock.calls[0]![0] as { businessSettingsId?: string };
    expect(callArgs.businessSettingsId).toBe('bs-ca-456');
  });

  test('creates AV doc and updates user to verified on instant approval', async () => {
    mockStartVerification.mockImplementation(async () => ({
      verificationId: 'pv-instant',
      status: 'approved' as const,
    }));

    const user = makeUser();
    const result = await startVerification(user, {
      jurisdiction: 'US-CA',
      callbackBaseUrl: 'https://api.example.com',
    });

    expect(result.status).toBe('approved');
    expect(result.backgroundCheckAttempted).toBe(true);
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
    expect(mockUpdateAgeVerification).toHaveBeenCalledTimes(1);

    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as unknown as { status: string };
    expect(avUpdate.status).toBe('verified');

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
  });

  test('marks user pending when redirect flow is needed', async () => {
    const user = makeUser();
    await startVerification(user, {
      jurisdiction: 'US-CA',
      callbackBaseUrl: 'https://api.example.com',
    });

    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as unknown as { status: string };
    expect(avUpdate.status).toBe('pending');
  });

  test('preserves expirationCount from existing user AV', async () => {
    const user = makeUser({
      ageVerification: {
        status: 'expired',
        expirationCount: 2,
        lastExpiredAt: new Date(),
      },
    });

    await startVerification(user, {
      jurisdiction: 'US-CA',
      callbackBaseUrl: 'https://api.example.com',
    });

    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as unknown as { expirationCount: number };
    expect(avUpdate.expirationCount).toBe(2);
  });

  test('uses countryOverride when provided', async () => {
    const user = makeUser();
    await startVerification(user, {
      jurisdiction: 'GB',
      callbackBaseUrl: 'https://api.example.com',
      countryOverride: 'gb',
    });

    const callArgs = mockStartVerification.mock.calls[0]![0] as { country: string };
    expect(callArgs.country).toBe('gb');
  });
});

describe('checkVerificationStatus', () => {
  const makeDoc = (overrides?: Partial<AgeVerificationDocument>): AgeVerificationDocument => ({
    _id: new ObjectId(),
    userId: USER_OID,
    providerId: 'verifymy',
    providerVerificationId: 'pv-123',
    status: 'started',
    jurisdiction: 'US-CA',
    startedAt: new Date(),
    optedIn: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgeVerificationDocument);

  test('returns cached result for terminal states without polling', async () => {
    const doc = makeDoc({ status: 'approved', approvalMethod: 'Email' });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);

    const user = makeUser();
    const result = await checkVerificationStatus(user, 'pv-123');

    expect(result.status).toBe('approved');
    expect(mockGetVerificationStatus).not.toHaveBeenCalled();
  });

  test('polls provider and updates on approved', async () => {
    const doc = makeDoc({ status: 'pending' });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);
    mockGetVerificationStatus.mockImplementation(async () => ({
      verificationId: 'pv-123',
      status: 'approved' as const,
      approvalMethod: 'AgeEstimation',
    }));

    const user = makeUser();
    const result = await checkVerificationStatus(user, 'pv-123');

    expect(result.status).toBe('approved');
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateAgeVerification).toHaveBeenCalledTimes(1);

    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as unknown as { status: string };
    expect(avUpdate.status).toBe('verified');
  });

  test('updates user on failed status', async () => {
    const doc = makeDoc({ status: 'pending' });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);
    mockGetVerificationStatus.mockImplementation(async () => ({
      verificationId: 'pv-123',
      status: 'failed' as const,
    }));

    const user = makeUser();
    const result = await checkVerificationStatus(user, 'pv-123');

    expect(result.status).toBe('failed');
    const avUpdate = mockUpdateAgeVerification.mock.calls[0]![1] as unknown as { status: string; failedAt: Date };
    expect(avUpdate.status).toBe('failed');
    expect(avUpdate.failedAt).toBeInstanceOf(Date);
  });

  test('increments expirationCount on expired status', async () => {
    const doc = makeDoc({ status: 'started' });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);
    mockGetVerificationStatus.mockImplementation(async () => ({
      verificationId: 'pv-123',
      status: 'expired' as const,
    }));

    const user = makeUser({
      ageVerification: { status: 'pending', expirationCount: 1 },
    });
    const result = await checkVerificationStatus(user, 'pv-123');

    expect(result.status).toBe('expired');
    const avUpdate = mockUpdateAgeVerification.mock.calls[1]![1] as unknown as { expirationCount: number; lastExpiredAt: Date };
    expect(avUpdate.expirationCount).toBe(2);
    expect(avUpdate.lastExpiredAt).toBeInstanceOf(Date);
  });

  test('throws when verification not found', async () => {
    mockFindByProviderVerificationId.mockImplementation(async () => null);

    const user = makeUser();
    await expect(checkVerificationStatus(user, 'pv-not-found')).rejects.toThrow('Verification not found');
  });

  test('throws when verification belongs to different user', async () => {
    const doc = makeDoc({
      userId: new ObjectId('000000000000000000000099'),
    });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);

    const user = makeUser();
    await expect(checkVerificationStatus(user, 'pv-123')).rejects.toThrow('Verification not found');
  });

  test('returns cached result on provider poll failure', async () => {
    const doc = makeDoc({ status: 'pending' });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);
    mockGetVerificationStatus.mockImplementation(async () => {
      throw new Error('Network error');
    });

    const user = makeUser();
    const result = await checkVerificationStatus(user, 'pv-123');

    expect(result.status).toBe('pending');
    expect(mockUpdateAgeVerification).not.toHaveBeenCalled();
  });

  test('includes methodAttempts with maxAttempts from provider', async () => {
    const doc = makeDoc({ status: 'pending' });
    mockFindByProviderVerificationId.mockImplementation(async () => doc);
    mockGetVerificationStatus.mockImplementation(async () => ({
      verificationId: 'pv-123',
      status: 'pending' as const,
      methodAttempts: {
        email: { enabled: true, maxAttempts: 3, remaining: 1 },
        fae: { enabled: true, maxAttempts: 5, remaining: 5 },
      },
    }));

    const user = makeUser();
    const result = await checkVerificationStatus(user, 'pv-123');

    expect(result.methodAttempts).toBeDefined();
    expect(result.methodAttempts!.email).toEqual({
      enabled: true,
      maxAttempts: 3,
      remaining: 1,
    });
  });
});
