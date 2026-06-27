import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
const verifyOtpMock = mock(() => Promise.resolve({ valid: false, error: 'invalid' })) as AnyMock;
const createOtpMock = mock(() => Promise.resolve('123456')) as AnyMock;
const checkRateLimitMock = mock(() => Promise.resolve({ allowed: true })) as AnyMock;
const sendEmailMock = mock(() => Promise.resolve({ success: true })) as AnyMock;
const sendSmsMock = mock(() => Promise.resolve({ success: true })) as AnyMock;

mock.module('../../services/otp.service', () => ({
  createOtp: createOtpMock,
  verifyOtp: verifyOtpMock,
}));

const userRepoMock = {
  findByEmail: mock(() => Promise.resolve(null)) as AnyMock,
  findByPhone: mock(() => Promise.resolve(null)) as AnyMock,
  updateById: mock(() => Promise.resolve(null)) as AnyMock,
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => userRepoMock,
}));

mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: checkRateLimitMock,
}));
mock.module('../../services/messaging', () => ({
  sendEmail: sendEmailMock,
  sendSms: sendSmsMock,
}));
mock.module('../../i18n', () => ({
  getEmailTemplate: mock(() => ({ subject: 's', text: 't', html: '<p>t</p>' })),
  getSmsMessage: mock(() => 'sms'),
  DEFAULT_LOCALE: 'en',
}));
mock.module('../../utils/timing', () => ({
  addJitter: mock(() => Promise.resolve()),
}));
mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import {
  verifyEmailAddress,
  verifyPhoneNumber,
  requestEmailVerification,
  requestPhoneVerification,
} from './controller';

describe('users verification controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    verifyOtpMock.mockReset();
    createOtpMock.mockReset();
    checkRateLimitMock.mockReset();
    sendEmailMock.mockReset();
    sendSmsMock.mockReset();
    userRepoMock.findByEmail.mockReset();
    userRepoMock.findByPhone.mockReset();
    userRepoMock.updateById.mockReset();
    userRepoMock.findById.mockReset();
    verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: false, error: 'invalid' }));
    createOtpMock.mockImplementation(() => Promise.resolve('123456'));
    checkRateLimitMock.mockImplementation(() => Promise.resolve({ allowed: true }));
    userRepoMock.findByEmail.mockImplementation(() => Promise.resolve(null));
    userRepoMock.findByPhone.mockImplementation(() => Promise.resolve(null));
    userRepoMock.updateById.mockImplementation(() => Promise.resolve(null));
    userRepoMock.findById.mockImplementation(() => Promise.resolve(null));
  });

  describe('requestEmailVerification', () => {
    test('returns rate_limited when ip limit exceeded', async () => {
      checkRateLimitMock.mockImplementationOnce(() => Promise.resolve({ allowed: false }));

      const result = await requestEmailVerification(
        new ObjectId().toHexString(),
        'user@example.com',
        '192.168.1.1'
      );

      expect(result).toEqual({ success: false, error: 'rate_limited' });
      expect(createOtpMock).not.toHaveBeenCalled();
    });

    test('returns already_verified when email already verified for user', async () => {
      const userId = new ObjectId();
      userRepoMock.findById.mockImplementation(() =>
        Promise.resolve({
          _id: userId,
          email: 'user@example.com',
          emailVerified: true,
        })
      );

      const result = await requestEmailVerification(
        userId.toHexString(),
        'user@example.com',
        '192.168.1.1'
      );

      expect(result).toEqual({ success: false, error: 'already_verified' });
    });

    test('returns success and creates otp for new verification', async () => {
      const result = await requestEmailVerification(
        new ObjectId().toHexString(),
        'user@example.com',
        '192.168.1.1'
      );

      expect(result).toEqual({ success: true });
      expect(createOtpMock).toHaveBeenCalledWith('user@example.com', 'email');
    });
  });

  describe('requestPhoneVerification', () => {
    test('returns rate_limited when identifier limit exceeded', async () => {
      checkRateLimitMock
        .mockImplementationOnce(() => Promise.resolve({ allowed: true }))
        .mockImplementationOnce(() => Promise.resolve({ allowed: false }));

      const result = await requestPhoneVerification(
        new ObjectId().toHexString(),
        '+15551234567',
        '192.168.1.1'
      );

      expect(result).toEqual({ success: false, error: 'rate_limited' });
    });

    test('returns already_verified when phone already verified for user', async () => {
      const userId = new ObjectId();
      userRepoMock.findById.mockImplementation(() =>
        Promise.resolve({
          _id: userId,
          phone: '+15551234567',
          phoneVerified: true,
        })
      );

      const result = await requestPhoneVerification(
        userId.toHexString(),
        '+15551234567',
        '192.168.1.1'
      );

      expect(result).toEqual({ success: false, error: 'already_verified' });
    });

    test('returns success and creates otp', async () => {
      const result = await requestPhoneVerification(
        new ObjectId().toHexString(),
        '+15551234567',
        '192.168.1.1'
      );

      expect(result).toEqual({ success: true });
      expect(createOtpMock).toHaveBeenCalled();
    });
  });

  describe('verifyEmailAddress', () => {
    test('maps OTP backoff state and retryAfter', async () => {
      verifyOtpMock.mockImplementation(() =>
        Promise.resolve({
          valid: false,
          error: 'backoff',
          retryAfterSeconds: 9,
        })
      );

      const result = await verifyEmailAddress(
        new ObjectId().toHexString(),
        'test@example.com',
        '123456'
      );
      expect(result).toEqual({
        success: false,
        error: 'backoff',
        retryAfterSeconds: 9,
      });
    });

    test('returns already_owned after OTP passes', async () => {
      const otherUserId = new ObjectId();
      verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: true }));
      userRepoMock.findByEmail.mockImplementation(() =>
        Promise.resolve({
          _id: otherUserId,
        })
      );

      const result = await verifyEmailAddress(
        new ObjectId().toHexString(),
        'owned@example.com',
        '123456'
      );
      expect(result).toEqual({ success: false, error: 'already_owned' });
    });

    test('returns max_attempts when otp service reports max attempts', async () => {
      verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: false, error: 'max_attempts' }));

      const result = await verifyEmailAddress(
        new ObjectId().toHexString(),
        'user@example.com',
        '000000'
      );

      expect(result).toEqual({ success: false, error: 'max_attempts' });
    });

    test('returns success and updates user when otp valid and email available', async () => {
      const userId = new ObjectId();
      verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: true }));
      userRepoMock.findByEmail.mockImplementation(() => Promise.resolve(null));
      userRepoMock.updateById.mockImplementation(() =>
        Promise.resolve({
          _id: userId,
          email: 'user@example.com',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await verifyEmailAddress(
        userId.toHexString(),
        'user@example.com',
        '123456'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.email).toBe('user@example.com');
      }
    });
  });

  describe('verifyPhoneNumber', () => {
    test('maps OTP not_found to expired', async () => {
      verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: false, error: 'not_found' }));
      const result = await verifyPhoneNumber(
        new ObjectId().toHexString(),
        '+15551234567',
        '123456'
      );
      expect(result).toEqual({ success: false, error: 'expired' });
    });

    test('returns already_owned after OTP passes', async () => {
      verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: true }));
      userRepoMock.findByPhone.mockImplementation(() =>
        Promise.resolve({
          _id: new ObjectId(),
        })
      );

      const result = await verifyPhoneNumber(
        new ObjectId().toHexString(),
        '+15551234567',
        '123456'
      );
      expect(result).toEqual({ success: false, error: 'already_owned' });
    });

    test('returns success and updates user when otp valid and phone available', async () => {
      const userId = new ObjectId();
      verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: true }));
      userRepoMock.findByPhone.mockImplementation(() => Promise.resolve(null));
      userRepoMock.updateById.mockImplementation(() =>
        Promise.resolve({
          _id: userId,
          phone: '+15551234567',
          phoneVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await verifyPhoneNumber(
        userId.toHexString(),
        '+15551234567',
        '123456'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.phone).toBe('+15551234567');
      }
    });
  });
});

