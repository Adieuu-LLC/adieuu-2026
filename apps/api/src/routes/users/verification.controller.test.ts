import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
const verifyOtpMock = mock(() => Promise.resolve({ valid: false, error: 'invalid' })) as AnyMock;

mock.module('../../services/otp.service', () => ({
  createOtp: mock(() => Promise.resolve('123456')),
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
  checkRateLimit: mock(() => Promise.resolve({ allowed: true })),
}));
mock.module('../../services/messaging', () => ({
  sendEmail: mock(() => Promise.resolve({ success: true })),
  sendSms: mock(() => Promise.resolve({ success: true })),
}));
mock.module('../../i18n', () => ({
  getEmailTemplate: mock(() => ({ subject: 's', text: 't', html: '<p>t</p>' })),
  getSmsMessage: mock(() => 'sms'),
  DEFAULT_LOCALE: 'en',
}));
mock.module('../../utils/timing', () => ({
  addJitter: mock(() => Promise.resolve()),
}));

import { verifyEmailAddress, verifyPhoneNumber } from './controller';

describe('users verification controller', () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    userRepoMock.findByEmail.mockReset();
    userRepoMock.findByPhone.mockReset();
    userRepoMock.updateById.mockReset();
    verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: false, error: 'invalid' }));
    userRepoMock.findByEmail.mockImplementation(() => Promise.resolve(null));
    userRepoMock.findByPhone.mockImplementation(() => Promise.resolve(null));
    userRepoMock.updateById.mockImplementation(() => Promise.resolve(null));
  });

  test('verifyEmailAddress maps OTP backoff state and retryAfter', async () => {
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

  test('verifyEmailAddress returns already_owned after OTP passes', async () => {
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

  test('verifyPhoneNumber maps OTP not_found to expired', async () => {
    verifyOtpMock.mockImplementation(() => Promise.resolve({ valid: false, error: 'not_found' }));
    const result = await verifyPhoneNumber(
      new ObjectId().toHexString(),
      '+15551234567',
      '123456'
    );
    expect(result).toEqual({ success: false, error: 'expired' });
  });

  test('verifyPhoneNumber returns already_owned after OTP passes', async () => {
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
});

