import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
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
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  findByCredentialId: mock(() => Promise.resolve(null)) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  updateCounter: mock(() => Promise.resolve()) as AnyMock,
  delete: mock(() => Promise.resolve(true)) as AnyMock,
  rename: mock(() => Promise.resolve(null)) as AnyMock,
};

/** Mutable return for `verifyRegistrationResponse` mock */
let mockVerifyRegistrationResult: {
  verified: boolean;
  registrationInfo?: {
    credential: { publicKey: Uint8Array; counter: number; id: Uint8Array };
    credentialDeviceType: 'singleDevice' | 'multiDevice';
    credentialBackedUp: boolean;
    aaguid: string;
  };
} = { verified: false };

/** Mutable return for `verifyAuthenticationResponse` mock */
let mockVerifyAuthenticationResult: {
  verified: boolean;
  authenticationInfo?: { newCounter: number };
} = { verified: false };

/** When set, WebAuthn verification mocks throw (library error paths) */
let mockVerifyRegistrationThrow: Error | null = null;
let mockVerifyAuthenticationThrow: Error | null = null;

/** Single `on` / `off`, or `first-on-then-off`: first call connected, then disconnected (covers clearMfaChallenge early return). */
type RedisConnectionMode = 'on' | 'off' | 'first-on-then-off';
let redisConnectionMode: RedisConnectionMode = 'on';
let redisOnOffCallCount = 0;

function isRedisConnectedForTest(): boolean {
  if (redisConnectionMode === 'on') return true;
  if (redisConnectionMode === 'off') return false;
  redisOnOffCallCount++;
  return redisOnOffCallCount === 1;
}

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

const generateRegistrationOptionsMock = mock(async () => ({ challenge: 'challenge' })) as AnyMock;
const generateAuthenticationOptionsMock = mock(async () => ({
  challenge: 'auth-challenge',
  allowCredentials: [] as { id: string; transports: string[] }[],
  rpId: 'localhost',
}));

mock.module('@simplewebauthn/server', () => ({
  generateRegistrationOptions: generateRegistrationOptionsMock,
  verifyRegistrationResponse: mock(async () => {
    if (mockVerifyRegistrationThrow) throw mockVerifyRegistrationThrow;
    return mockVerifyRegistrationResult;
  }),
  generateAuthenticationOptions: generateAuthenticationOptionsMock,
  verifyAuthenticationResponse: mock(async () => {
    if (mockVerifyAuthenticationThrow) throw mockVerifyAuthenticationThrow;
    return mockVerifyAuthenticationResult;
  }),
}));

mock.module('../repositories', () => ({
  getTotpRepository: () => mockTotpRepo,
  getWebAuthnRepository: () => mockWebAuthnRepo,
}));

mock.module('../db', () => ({
  getRedis: () => ({
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
  }),
  isRedisConnected: () => isRedisConnectedForTest(),
  RedisKeys: {},
}));

import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  verifyAndActivateTotp,
  verifyTotpCode,
  getMfaStatus,
  createMfaLoginChallenge,
  getMfaLoginChallenge,
  clearMfaLoginChallenge,
  generateTotpSetup,
  savePendingTotp,
  deleteTotp,
  generateWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  deleteWebAuthnCredential,
  renameWebAuthnCredential,
  getMfaCredentials,
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
    mockVerifyRegistrationResult = { verified: false };
    mockVerifyAuthenticationResult = { verified: false };
    mockVerifyRegistrationThrow = null;
    mockVerifyAuthenticationThrow = null;
    redisConnectionMode = 'on';
    redisOnOffCallCount = 0;
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
    mockWebAuthnRepo.findById.mockReset();
    mockWebAuthnRepo.findByCredentialId.mockReset();
    mockWebAuthnRepo.create.mockReset();
    mockWebAuthnRepo.updateCounter.mockReset();
    mockWebAuthnRepo.delete.mockReset();
    mockWebAuthnRepo.rename.mockReset();

    generateRegistrationOptionsMock.mockClear();
    generateAuthenticationOptionsMock.mockClear();

    mockTotpRepo.findById.mockResolvedValue(null);
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([]);
    mockTotpRepo.verify.mockResolvedValue(null);
    mockTotpRepo.updateLastUsed.mockResolvedValue(undefined);
    mockTotpRepo.delete.mockResolvedValue(true);

    mockWebAuthnRepo.findByUserId.mockResolvedValue([]);
    mockWebAuthnRepo.findById.mockResolvedValue(null);
    mockWebAuthnRepo.findByCredentialId.mockResolvedValue(null);
    mockWebAuthnRepo.create.mockResolvedValue(null);
    mockWebAuthnRepo.updateCounter.mockResolvedValue(undefined);
    mockWebAuthnRepo.delete.mockResolvedValue(true);
    mockWebAuthnRepo.rename.mockResolvedValue(null);
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

  test('getMfaStatus reflects enabled TOTP and WebAuthn methods', async () => {
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
    const status = await getMfaStatus(userId);
    expect(status.enabled).toBe(true);
    expect(status.totpEnabled).toBe(true);
    expect(status.webauthnEnabled).toBe(true);
    expect(status.totpCount).toBe(1);
    expect(status.webauthnCount).toBe(1);
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

  test('generateTotpSetup returns otpauth URL and manual entry key', () => {
    const setup = generateTotpSetup('user@example.com');
    expect(setup.qrCodeUrl).toBe('otpauth://totp/Test');
    expect(setup.secret).toBe('TESTBASE32SECRET');
    expect(setup.manualEntryKey).toBe('TESTBASE32SECRET');
  });

  test('savePendingTotp encrypts and stores a pending credential', async () => {
    const createdId = new ObjectId();
    mockTotpRepo.create.mockResolvedValue({
      _id: createdId,
      userId: new ObjectId(userId),
      encryptedSecret: 'enc',
      name: 'Phone',
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const doc = await savePendingTotp(userId, 'RAWSECRETB32', 'Phone');
    expect(doc._id.toHexString()).toBe(createdId.toHexString());
    expect(mockTotpRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: new ObjectId(userId),
        name: 'Phone',
        encryptedSecret: expect.any(String),
      }),
    );
  });

  test('verifyTotpCode returns no_totp_configured or invalid_code', async () => {
    expect(await verifyTotpCode(userId, '123456')).toEqual({ success: false, error: 'no_totp_configured' });

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
    mockTotpValidateResult = null;
    expect(await verifyTotpCode(userId, '000000')).toEqual({ success: false, error: 'invalid_code' });
  });

  test('deleteTotp removes credential when it is the last MFA method', async () => {
    mockTotpRepo.findById.mockResolvedValue({
      _id: totpDocId,
      userId: new ObjectId(userId),
      encryptedSecret: encryptedABC,
      name: 'totp',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([]);
    mockWebAuthnRepo.findByUserId.mockResolvedValue([]);

    const result = await deleteTotp(totpDocId.toHexString(), userId);
    expect(result).toEqual({ success: true });
    expect(mockTotpRepo.delete).toHaveBeenCalledWith(totpDocId.toHexString());
  });

  test('deleteTotp rejects not_found or unauthorized', async () => {
    expect(await deleteTotp(totpDocId.toHexString(), userId)).toEqual({ success: false, error: 'not_found' });

    mockTotpRepo.findById.mockResolvedValue({
      _id: totpDocId,
      userId: new ObjectId(),
      encryptedSecret: encryptedABC,
      name: 'totp',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await deleteTotp(totpDocId.toHexString(), userId)).toEqual({ success: false, error: 'unauthorized' });
  });

  test('generateWebAuthnRegistrationOptions stores challenge in redis', async () => {
    const { options, challenge } = await generateWebAuthnRegistrationOptions(userId, 'user@x.com', 'User');
    expect(options.challenge).toBe('challenge');
    expect(challenge).toBe('challenge');
    expect(redisSetMock).toHaveBeenCalledWith(
      `mfa:challenge:registration:${userId}`,
      'challenge',
      'EX',
      300,
    );
  });

  test('verifyWebAuthnRegistration fails when challenge missing or response invalid', async () => {
    redisGetValue = null;
    const bad = await verifyWebAuthnRegistration(userId, {} as RegistrationResponseJSON, 'key');
    expect(bad).toEqual({ success: false, error: 'challenge_expired' });

    redisGetValue = 'stored-challenge';
    const minimal: RegistrationResponseJSON = {
      id: 'cred-id',
      rawId: 'raw',
      type: 'public-key',
      response: {} as RegistrationResponseJSON['response'],
      clientExtensionResults: {},
    };
    const invalidStructure = await verifyWebAuthnRegistration(userId, minimal, 'key');
    expect(invalidStructure).toEqual({ success: false, error: 'invalid_response' });
  });

  test('verifyWebAuthnRegistration saves credential when verification succeeds', async () => {
    redisGetValue = 'stored-challenge';
    mockVerifyRegistrationResult = {
      verified: true,
      registrationInfo: {
        credential: {
          publicKey: new Uint8Array([9, 9, 9]),
          counter: 0,
          id: new Uint8Array([1]),
        },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        aaguid: '00000000-0000-0000-0000-000000000000',
      },
    };
    const savedId = new ObjectId();
    mockWebAuthnRepo.create.mockResolvedValue({
      _id: savedId,
      userId: new ObjectId(userId),
      credentialId: 'browser-cred-id',
      publicKey: 'pk',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'key',
      transports: ['internal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const clientDataJSON = Buffer.from(JSON.stringify({ origin: 'http://localhost:5173' })).toString('base64url');
    const regResponse = {
      id: 'browser-cred-id',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON,
        attestationObject: Buffer.from('att').toString('base64url'),
        transports: ['internal'] as const,
      },
      clientExtensionResults: {},
    } as RegistrationResponseJSON;

    const result = await verifyWebAuthnRegistration(userId, regResponse, 'My key');
    expect(result.success).toBe(true);
    expect(result.credential?._id.toHexString()).toBe(savedId.toHexString());
    expect(mockWebAuthnRepo.create).toHaveBeenCalled();
    expect(redisDelMock).toHaveBeenCalledWith(`mfa:challenge:registration:${userId}`);
  });

  test('clearMfaChallenge skips del when Redis disconnects after challenge read (registration)', async () => {
    redisConnectionMode = 'first-on-then-off';
    redisGetValue = 'stored-challenge';
    mockVerifyRegistrationResult = {
      verified: true,
      registrationInfo: {
        credential: {
          publicKey: new Uint8Array([9, 9, 9]),
          counter: 0,
          id: new Uint8Array([1]),
        },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        aaguid: '00000000-0000-0000-0000-000000000000',
      },
    };
    const savedId = new ObjectId();
    mockWebAuthnRepo.create.mockResolvedValue({
      _id: savedId,
      userId: new ObjectId(userId),
      credentialId: 'browser-cred-id',
      publicKey: 'pk',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'key',
      transports: ['internal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const clientDataJSON = Buffer.from(JSON.stringify({ origin: 'http://localhost:5173' })).toString('base64url');
    const regResponse = {
      id: 'browser-cred-id',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON,
        attestationObject: Buffer.from('att').toString('base64url'),
        transports: ['internal'] as const,
      },
      clientExtensionResults: {},
    } as RegistrationResponseJSON;

    const result = await verifyWebAuthnRegistration(userId, regResponse, 'My key');
    expect(result.success).toBe(true);
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  test('generateWebAuthnAuthenticationOptions returns null when user has no passkeys', async () => {
    const opts = await generateWebAuthnAuthenticationOptions(userId);
    expect(opts).toBeNull();
  });

  test('generateWebAuthnAuthenticationOptions stores authentication challenge', async () => {
    mockWebAuthnRepo.findByUserId.mockResolvedValue([
      {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        credentialId: 'cred-1',
        publicKey: 'pk',
        counter: 1,
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'k',
        transports: ['internal'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const out = await generateWebAuthnAuthenticationOptions(userId);
    expect(out?.challenge).toBe('auth-challenge');
    expect(redisSetMock).toHaveBeenCalledWith(
      `mfa:challenge:authentication:${userId}`,
      'auth-challenge',
      'EX',
      300,
    );
  });

  test('verifyWebAuthnAuthentication handles missing credential and success path', async () => {
    redisGetValue = 'ch';
    const authResponse = {
      id: 'unknown',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        authenticatorData: Buffer.from('auth').toString('base64url'),
        signature: Buffer.from('sig').toString('base64url'),
      },
      clientExtensionResults: {},
    } as AuthenticationResponseJSON;

    const missing = await verifyWebAuthnAuthentication(userId, authResponse);
    expect(missing).toEqual({ success: false, error: 'credential_not_found' });

    const waId = new ObjectId();
    mockWebAuthnRepo.findByCredentialId.mockResolvedValue({
      _id: waId,
      userId: new ObjectId(userId),
      credentialId: 'ok-cred',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      transports: ['internal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockVerifyAuthenticationResult = { verified: true, authenticationInfo: { newCounter: 42 } };

    const okResponse = { ...authResponse, id: 'ok-cred' };
    const ok = await verifyWebAuthnAuthentication(userId, okResponse);
    expect(ok).toEqual({ success: true, credentialId: waId.toHexString() });
    expect(mockWebAuthnRepo.updateCounter).toHaveBeenCalledWith(waId, 42);
    expect(redisDelMock).toHaveBeenCalledWith(`mfa:challenge:authentication:${userId}`);
  });

  test('clearMfaChallenge skips del when Redis disconnects after challenge read (authentication)', async () => {
    redisConnectionMode = 'first-on-then-off';
    redisGetValue = 'ch';
    const waId = new ObjectId();
    mockWebAuthnRepo.findByCredentialId.mockResolvedValue({
      _id: waId,
      userId: new ObjectId(userId),
      credentialId: 'ok-cred',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      transports: ['internal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockVerifyAuthenticationResult = { verified: true, authenticationInfo: { newCounter: 42 } };

    const authResponse = {
      id: 'ok-cred',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        authenticatorData: Buffer.from('auth').toString('base64url'),
        signature: Buffer.from('sig').toString('base64url'),
      },
      clientExtensionResults: {},
    } as AuthenticationResponseJSON;

    const ok = await verifyWebAuthnAuthentication(userId, authResponse);
    expect(ok).toEqual({ success: true, credentialId: waId.toHexString() });
    expect(mockWebAuthnRepo.updateCounter).toHaveBeenCalledWith(waId, 42);
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  test('verifyWebAuthnAuthentication rejects wrong user', async () => {
    redisGetValue = 'ch';
    mockWebAuthnRepo.findByCredentialId.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(),
      credentialId: 'x',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const authResponse = {
      id: 'x',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        authenticatorData: Buffer.from('a').toString('base64url'),
        signature: Buffer.from('s').toString('base64url'),
      },
      clientExtensionResults: {},
    } as AuthenticationResponseJSON;

    const out = await verifyWebAuthnAuthentication(userId, authResponse);
    expect(out).toEqual({ success: false, error: 'unauthorized' });
  });

  test('deleteWebAuthnCredential removes passkey when it is the last MFA method', async () => {
    const credId = new ObjectId().toHexString();
    mockWebAuthnRepo.findById.mockResolvedValue({
      _id: new ObjectId(credId),
      userId: new ObjectId(userId),
      credentialId: 'c',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([]);
    mockWebAuthnRepo.findByUserId.mockResolvedValue([]);

    const result = await deleteWebAuthnCredential(credId, userId);
    expect(result).toEqual({ success: true });
    expect(mockWebAuthnRepo.delete).toHaveBeenCalledWith(credId);
  });

  test('renameWebAuthnCredential updates name when authorized', async () => {
    const credId = new ObjectId().toHexString();
    mockWebAuthnRepo.findById.mockResolvedValue({
      _id: new ObjectId(credId),
      userId: new ObjectId(userId),
      credentialId: 'c',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'old',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockWebAuthnRepo.rename.mockResolvedValue({
      _id: new ObjectId(credId),
      userId: new ObjectId(userId),
      credentialId: 'c',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await renameWebAuthnCredential(credId, userId, 'new');
    expect(result).toEqual({ success: true });
    expect(mockWebAuthnRepo.rename).toHaveBeenCalledWith(credId, 'new');
  });

  test('getMfaCredentials returns verified TOTP and WebAuthn lists', async () => {
    const totpDoc = {
      _id: totpDocId,
      userId: new ObjectId(userId),
      encryptedSecret: encryptedValidSecret,
      name: 'totp',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const waDoc = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      credentialId: 'c',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice' as const,
      backedUp: false,
      name: 'k',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([totpDoc]);
    mockWebAuthnRepo.findByUserId.mockResolvedValue([waDoc]);

    const { totp, webauthn } = await getMfaCredentials(userId);
    expect(totp).toHaveLength(1);
    expect(webauthn).toHaveLength(1);
    expect(totp[0]?._id.toHexString()).toBe(totpDocId.toHexString());
  });

  test('createMfaLoginChallenge returns null when MFA is disabled', async () => {
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([]);
    mockWebAuthnRepo.findByUserId.mockResolvedValue([]);

    const challenge = await createMfaLoginChallenge(userId, 'sess');
    expect(challenge).toBeNull();
  });

  test('getMfaLoginChallenge returns null for expired challenge', async () => {
    const past = Date.now() - 60_000;
    redisGetValue = JSON.stringify({
      userId,
      sessionId: 's',
      requiredMfaTypes: ['totp'],
      createdAt: past,
      expiresAt: past,
    });

    const result = await getMfaLoginChallenge('s');
    expect(result).toBeNull();
    expect(redisDelMock).toHaveBeenCalled();
  });

  test('MFA login challenge redis helpers no-op when redis is disconnected', async () => {
    redisConnectionMode = 'off';

    expect(await getMfaLoginChallenge('any')).toBeNull();

    await clearMfaLoginChallenge('any');
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  test('WebAuthn registration options succeed but skip redis when disconnected', async () => {
    redisConnectionMode = 'off';
    const { options, challenge } = await generateWebAuthnRegistrationOptions(userId, 'u@x.com');
    expect(options.challenge).toBe('challenge');
    expect(challenge).toBe('challenge');
    expect(redisSetMock).not.toHaveBeenCalled();
  });

  test('generateWebAuthnRegistrationOptions passes excludeCredentials for existing passkeys', async () => {
    mockWebAuthnRepo.findByUserId.mockResolvedValue([
      {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        credentialId: 'existing-b64',
        publicKey: 'pk',
        counter: 1,
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'k',
        transports: ['internal', 'usb'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await generateWebAuthnRegistrationOptions(userId, 'u@x.com');
    const opts = generateRegistrationOptionsMock.mock.calls[0]?.[0] as unknown as {
      excludeCredentials?: { id: string }[];
    };
    expect(opts?.excludeCredentials).toHaveLength(1);
    expect(opts?.excludeCredentials?.[0]?.id).toBe('existing-b64');
  });

  test('verifyWebAuthnRegistration returns verification_failed when library throws or rejects', async () => {
    redisGetValue = 'stored-challenge';
    mockVerifyRegistrationThrow = new Error('attestation rejected');

    const clientDataJSON = Buffer.from(JSON.stringify({ origin: 'http://localhost:5173' })).toString('base64url');
    const regResponse = {
      id: 'id',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON,
        attestationObject: Buffer.from('att').toString('base64url'),
        transports: ['internal'] as const,
      },
      clientExtensionResults: {},
    } as RegistrationResponseJSON;

    const result = await verifyWebAuthnRegistration(userId, regResponse, 'key');
    expect(result).toEqual({ success: false, error: 'verification_failed' });
  });

  test('verifyWebAuthnRegistration returns verification_failed when not verified or missing registrationInfo', async () => {
    redisGetValue = 'stored-challenge';
    mockVerifyRegistrationThrow = null;
    mockVerifyRegistrationResult = { verified: false };

    const clientDataJSON = Buffer.from(JSON.stringify({ origin: 'http://localhost:5173' })).toString('base64url');
    const regResponse = {
      id: 'id',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON,
        attestationObject: Buffer.from('att').toString('base64url'),
        transports: ['internal'] as const,
      },
      clientExtensionResults: {},
    } as RegistrationResponseJSON;

    const unverified = await verifyWebAuthnRegistration(userId, regResponse, 'key');
    expect(unverified).toEqual({ success: false, error: 'verification_failed' });

    mockVerifyRegistrationResult = { verified: true, registrationInfo: undefined };
    const noInfo = await verifyWebAuthnRegistration(userId, regResponse, 'key');
    expect(noInfo).toEqual({ success: false, error: 'verification_failed' });
  });

  test('verifyWebAuthnAuthentication returns challenge_expired when redis has no challenge', async () => {
    redisGetValue = null;
    const authResponse = {
      id: 'x',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        authenticatorData: Buffer.from('a').toString('base64url'),
        signature: Buffer.from('s').toString('base64url'),
      },
      clientExtensionResults: {},
    } as AuthenticationResponseJSON;

    expect(await verifyWebAuthnAuthentication(userId, authResponse)).toEqual({
      success: false,
      error: 'challenge_expired',
    });
  });

  test('WebAuthn flows return challenge_expired when Redis is disconnected (getMfaChallenge early exit)', async () => {
    redisConnectionMode = 'off';
    redisGetValue = 'would-be-challenge';

    const regResponse = {
      id: 'id',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ origin: 'http://localhost:5173' })).toString('base64url'),
        attestationObject: Buffer.from('att').toString('base64url'),
        transports: ['internal'] as const,
      },
      clientExtensionResults: {},
    } as RegistrationResponseJSON;

    expect(await verifyWebAuthnRegistration(userId, regResponse, 'key')).toEqual({
      success: false,
      error: 'challenge_expired',
    });

    const authResponse = {
      id: 'x',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        authenticatorData: Buffer.from('a').toString('base64url'),
        signature: Buffer.from('s').toString('base64url'),
      },
      clientExtensionResults: {},
    } as AuthenticationResponseJSON;

    expect(await verifyWebAuthnAuthentication(userId, authResponse)).toEqual({
      success: false,
      error: 'challenge_expired',
    });
  });

  test('verifyWebAuthnAuthentication returns verification_failed on library failure or unverified', async () => {
    redisGetValue = 'ch';
    const waId = new ObjectId();
    mockWebAuthnRepo.findByCredentialId.mockResolvedValue({
      _id: waId,
      userId: new ObjectId(userId),
      credentialId: 'ok-cred',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      transports: ['internal'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const authResponse = {
      id: 'ok-cred',
      rawId: 'raw',
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        authenticatorData: Buffer.from('a').toString('base64url'),
        signature: Buffer.from('s').toString('base64url'),
      },
      clientExtensionResults: {},
    } as AuthenticationResponseJSON;

    mockVerifyAuthenticationThrow = new Error('bad signature');
    expect(await verifyWebAuthnAuthentication(userId, authResponse)).toEqual({
      success: false,
      error: 'verification_failed',
    });

    mockVerifyAuthenticationThrow = null;
    mockVerifyAuthenticationResult = { verified: false };
    expect(await verifyWebAuthnAuthentication(userId, authResponse)).toEqual({
      success: false,
      error: 'verification_failed',
    });
  });

  test('deleteWebAuthnCredential and renameWebAuthnCredential reject not_found or unauthorized', async () => {
    expect(await deleteWebAuthnCredential(new ObjectId().toHexString(), userId)).toEqual({
      success: false,
      error: 'not_found',
    });

    const credId = new ObjectId().toHexString();
    mockWebAuthnRepo.findById.mockResolvedValue({
      _id: new ObjectId(credId),
      userId: new ObjectId(),
      credentialId: 'c',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await deleteWebAuthnCredential(credId, userId)).toEqual({ success: false, error: 'unauthorized' });

    mockWebAuthnRepo.findById.mockResolvedValue(null);
    expect(await renameWebAuthnCredential(credId, userId, 'n')).toEqual({ success: false, error: 'not_found' });

    mockWebAuthnRepo.findById.mockResolvedValue({
      _id: new ObjectId(credId),
      userId: new ObjectId(),
      credentialId: 'c',
      publicKey: 'pk',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'k',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await renameWebAuthnCredential(credId, userId, 'n')).toEqual({ success: false, error: 'unauthorized' });
  });

  test('createMfaLoginChallenge attaches webauthnChallenge when only WebAuthn is enabled', async () => {
    mockTotpRepo.findVerifiedByUserId.mockResolvedValue([]);
    mockWebAuthnRepo.findByUserId.mockResolvedValue([
      {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        credentialId: 'c1',
        publicKey: 'pk',
        counter: 1,
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'k',
        transports: ['internal'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const challenge = await createMfaLoginChallenge(userId, 'sess-wa');
    expect(challenge).not.toBeNull();
    expect(challenge?.requiredMfaTypes).toEqual(['webauthn']);
    expect(challenge?.webauthnChallenge).toBe('auth-challenge');
    expect(generateAuthenticationOptionsMock).toHaveBeenCalled();
  });

  test('getMfaLoginChallenge returns null when redis has no key', async () => {
    redisGetValue = null;
    expect(await getMfaLoginChallenge('missing-session')).toBeNull();
  });
});

