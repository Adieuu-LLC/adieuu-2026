import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

let mockTotpValidateResult: number | null = 0;

class MockSecret {
  base32: string;
  constructor() {
    this.base32 = 'TESTBASE32SECRET';
  }
  static fromBase32(value: string): { base32: string } {
    return { base32: value };
  }
}

class MockTOTP {
  constructor(_opts: unknown) {}
  toString(): string {
    return 'otpauth://totp/Test';
  }
  validate(): number | null {
    return mockTotpValidateResult;
  }
}

const mockConfig = {
  appName: 'Adieuu',
  webauthn: {
    rpId: 'localhost',
    origins: ['http://localhost:5173'],
  },
  security: {
    otpSecret: 'otp-secret-for-tests',
    sessionSecret: 'test-session-secret',
  },
};

const mockTotpRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  findVerifiedByUserId: mock(() => Promise.resolve([])) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  verify: mock(() => Promise.resolve(null)) as AnyMock,
  updateLastUsed: mock(() => Promise.resolve()) as AnyMock,
  delete: mock(() => Promise.resolve(true)) as AnyMock,
};

const mockWebAuthnRepo = {
  findByUserId: mock(() => Promise.resolve([])) as AnyMock,
};

const mockBackupRepo = {
  findByUserId: mock(() => Promise.resolve(null)) as AnyMock,
  updateCodes: mock(() => Promise.resolve()) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  deleteForUser: mock(() => Promise.resolve(false)) as AnyMock,
};

let redisConnected = true;
let redisGetValue: string | null = null;
const redisSetMock = mock(() => Promise.resolve('OK'));
const redisGetMock = mock(async () => redisGetValue);
const redisDelMock = mock(() => Promise.resolve(1));

mock.module('../config', () => ({
  config: mockConfig,
}));

mock.module('otpauth', () => ({
  Secret: MockSecret,
  TOTP: MockTOTP,
}));

mock.module('@simplewebauthn/server', () => ({
  generateRegistrationOptions: mock(async () => ({ challenge: 'challenge' })),
  verifyRegistrationResponse: mock(async () => ({ verified: false })),
  generateAuthenticationOptions: mock(async () => ({ challenge: 'auth-challenge', allowCredentials: [] })),
  verifyAuthenticationResponse: mock(async () => ({ verified: false })),
}));

mock.module('../repositories', () => ({
  getTotpRepository: () => mockTotpRepo,
  getWebAuthnRepository: () => mockWebAuthnRepo,
  getBackupCodesRepository: () => mockBackupRepo,
}));

mock.module('../db', () => ({
  getRedis: () => ({
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
  }),
  isRedisConnected: () => redisConnected,
  RedisKeys: {},
}));

import {
  verifyAndActivateTotp,
  verifyTotpCode,
  verifyBackupCode,
  getMfaStatus,
  createMfaLoginChallenge,
  getMfaLoginChallenge,
  clearMfaLoginChallenge,
} from './mfa.service';
import { encrypt } from '../utils/crypto';

const encryptedABC = encrypt('ABC');
const encryptedValidSecret = encrypt('VALIDSECRET');

describe('mfa.service', () => {
  afterAll(() => {
    mock.restore();
  });

  const userId = new ObjectId().toHexString();
  const totpDocId = new ObjectId();

  beforeEach(() => {
    mockTotpValidateResult = 0;
    redisConnected = true;
    redisGetValue = null;
    redisSetMock.mockClear();
    redisGetMock.mockClear();
    redisDelMock.mockClear();

    mockTotpRepo.findById.mockReset();
    mockTotpRepo.findVerifiedByUserId.mockReset();
    mockTotpRepo.create.mockReset();
    mockTotpRepo.verify.mockReset();
    mockTotpRepo.updateLastUsed.mockReset();
    mockTotpRepo.delete.mockReset();

    mockWebAuthnRepo.findByUserId.mockReset();

    mockBackupRepo.findByUserId.mockReset();
    mockBackupRepo.updateCodes.mockReset();
    mockBackupRepo.create.mockReset();
    mockBackupRepo.deleteForUser.mockReset();

    mockTotpRepo.findById.mockResolvedValue(null);
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([]);
    mockTotpRepo.verify.mockResolvedValue(null);
    mockTotpRepo.updateLastUsed.mockResolvedValue(undefined);
    mockTotpRepo.delete.mockResolvedValue(true);

    mockWebAuthnRepo.findByUserId.mockResolvedValue([]);

    mockBackupRepo.findByUserId.mockResolvedValue(null);
    mockBackupRepo.updateCodes.mockResolvedValue(undefined);
    mockBackupRepo.create.mockResolvedValue(null);
    mockBackupRepo.deleteForUser.mockResolvedValue(false);
  });

  test('verifyAndActivateTotp rejects missing, unauthorized, or already verified credentials', async () => {
    expect(await verifyAndActivateTotp(totpDocId.toHexString(), '123456', userId)).toEqual({
      success: false,
      error: 'totp_not_found',
    });

    mockTotpRepo.findById.mockResolvedValue({
      _id: totpDocId,
      userId: new ObjectId(),
      encryptedSecret: encryptedABC,
      name: 'totp',
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await verifyAndActivateTotp(totpDocId.toHexString(), '123456', userId)).toEqual({
      success: false,
      error: 'unauthorized',
    });

    mockTotpRepo.findById.mockResolvedValue({
      _id: totpDocId,
      userId: new ObjectId(userId),
      encryptedSecret: encryptedABC,
      name: 'totp',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await verifyAndActivateTotp(totpDocId.toHexString(), '123456', userId)).toEqual({
      success: false,
      error: 'already_verified',
    });
  });

  test('verifyAndActivateTotp fails on decryption or invalid token and succeeds on valid token', async () => {
    mockTotpRepo.findById.mockResolvedValue({
      _id: totpDocId,
      userId: new ObjectId(userId),
      encryptedSecret: 'corrupt',
      name: 'totp',
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await verifyAndActivateTotp(totpDocId.toHexString(), '123456', userId)).toEqual({
      success: false,
      error: 'decryption_failed',
    });

    mockTotpRepo.findById.mockResolvedValue({
      _id: totpDocId,
      userId: new ObjectId(userId),
      encryptedSecret: encryptedValidSecret,
      name: 'totp',
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockTotpValidateResult = null;
    expect(await verifyAndActivateTotp(totpDocId.toHexString(), '123456', userId)).toEqual({
      success: false,
      error: 'invalid_code',
    });

    mockTotpValidateResult = 0;
    expect(await verifyAndActivateTotp(totpDocId.toHexString(), '123456', userId)).toEqual({
      success: true,
    });
    expect(mockTotpRepo.verify).toHaveBeenCalledWith(totpDocId.toHexString());
  });

  test('verifyTotpCode updates lastUsed for matching verified credential', async () => {
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([
      {
        _id: totpDocId,
        userId: new ObjectId(userId),
        encryptedSecret: encryptedValidSecret,
        name: 'totp',
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockTotpValidateResult = 0;

    const result = await verifyTotpCode(userId, '123456');
    expect(result.success).toBe(true);
    expect(result.credentialId).toBe(totpDocId.toHexString());
    expect(mockTotpRepo.updateLastUsed).toHaveBeenCalledWith(totpDocId);
  });

  test('verifyBackupCode consumes matching backup code and reports remaining count', async () => {
    const code = 'ABCD-EFGH';
    const normalized = code.replace(/-/g, '').toUpperCase();
    const hashed = createHash('sha256')
      .update(`${normalized}:${userId}:${mockConfig.security.otpSecret}`)
      .digest('hex');

    mockBackupRepo.findByUserId.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      hashedCodes: [hashed, 'other'],
      totalGenerated: 2,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await verifyBackupCode(userId, code);
    expect(result).toEqual({ success: true, remaining: 1 });
    expect(mockBackupRepo.updateCodes).toHaveBeenCalledWith(userId, ['other']);
  });

  test('getMfaStatus reflects enabled methods and remaining backup codes', async () => {
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([{
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      encryptedSecret: encryptedValidSecret,
      name: 'totp',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    mockWebAuthnRepo.findByUserId.mockResolvedValue([{
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      credentialId: 'cred',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'key',
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    mockBackupRepo.findByUserId.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      hashedCodes: ['a', 'b'],
      totalGenerated: 2,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const status = await getMfaStatus(userId);
    expect(status.enabled).toBe(true);
    expect(status.totpEnabled).toBe(true);
    expect(status.webauthnEnabled).toBe(true);
    expect(status.backupCodesRemaining).toBe(2);
  });

  test('create/get/clear MFA login challenge handles redis and malformed data safely', async () => {
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([{
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      encryptedSecret: encryptedValidSecret,
      name: 'totp',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const challenge = await createMfaLoginChallenge(userId, 'session-1');
    expect(challenge).not.toBeNull();
    expect(challenge?.requiredMfaTypes).toEqual(['totp']);
    expect(redisSetMock).toHaveBeenCalledTimes(1);

    redisGetValue = '{"bad json"';
    const malformed = await getMfaLoginChallenge('session-1');
    expect(malformed).toBeNull();
    expect(redisDelMock).toHaveBeenCalled();

    await clearMfaLoginChallenge('session-1');
    expect(redisDelMock).toHaveBeenCalled();
  });
});

