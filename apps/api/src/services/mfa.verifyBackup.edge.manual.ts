/**
 * Isolated edge test: filename must be `*.edge.manual.ts` under `src/`.
 * Discovered by `scripts/run-tests.sh` and `scripts/run-tests-with-coverage.sh` (not by default `bun test` glob).
 * Run alone: `bun test ./src/services/mfa.verifyBackup.edge.manual.ts`
 * Uses a stub `crypto.createHash` in a dedicated process so the global `crypto` module is not poisoned for other tests.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

let digestInvocation = 0;

mock.module('../config', () => ({
  config: {
    appName: 'Adieuu',
    webauthn: { rpId: 'localhost', origins: ['http://localhost:5173'] },
    security: { otpSecret: 'otp-secret-for-tests', sessionSecret: 'test-session-secret' },
  },
}));

mock.module('crypto', () => ({
  createHash: () => ({
    update() {
      return this;
    },
    digest() {
      digestInvocation += 1;
      return digestInvocation === 1 ? 'a'.repeat(64) : 'b'.repeat(64);
    },
  }),
}));

mock.module('../repositories', () => ({
  getTotpRepository: () => ({}),
  getWebAuthnRepository: () => ({}),
  getBackupCodesRepository: () => mockBackupRepo,
}));

const mockBackupRepo = {
  findByUserId: mock(() => Promise.resolve(null)) as AnyMock,
  updateCodes: mock(() => Promise.resolve()) as AnyMock,
};

mock.module('../db', () => ({
  getRedis: () => ({ set: mock(), get: mock(), del: mock() }),
  isRedisConnected: () => true,
  RedisKeys: {},
}));

mock.module('otpauth', () => ({ Secret: class {}, TOTP: class {} }));
mock.module('@simplewebauthn/server', () => ({}));

import { verifyBackupCode } from './mfa.service';

describe('verifyBackupCode fallback hash path (isolated process)', () => {
  const userId = new ObjectId().toHexString();

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    digestInvocation = 0;
    mockBackupRepo.findByUserId.mockReset();
    mockBackupRepo.updateCodes.mockReset();
    mockBackupRepo.findByUserId.mockResolvedValue(null);
    mockBackupRepo.updateCodes.mockResolvedValue(undefined);
  });

  test('consumes code when only the second hash probe matches stored list', async () => {
    mockBackupRepo.findByUserId.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      hashedCodes: ['b'.repeat(64)],
      totalGenerated: 1,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await verifyBackupCode(userId, 'ABCD-EFGH');
    expect(result).toEqual({ success: true, remaining: 0 });
    expect(mockBackupRepo.updateCodes).toHaveBeenCalledWith(userId, []);
    expect(digestInvocation).toBe(2);
  });
});
