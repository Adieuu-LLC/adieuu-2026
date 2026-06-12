import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

const mockSendEmail = mock(() => Promise.resolve({ success: true, messageId: 'email-1' }));
const mockSendSms = mock(() => Promise.resolve({ success: true, messageId: 'sms-1' }));
const mockGetEmailTemplate = mock(() => ({
  subject: 'Security alert',
  text: 'Email body',
  html: '<p>Email body</p>',
}));
const mockGetSmsMessage = mock(() => 'SMS body');
const mockInfo = mock(() => {});
const mockWarn = mock(() => {});

mock.module('../../config', () => ({
  config: { email: { fromName: 'TestApp' } },
}));

mock.module('../../i18n', () => ({
  DEFAULT_LOCALE: 'en',
  getEmailTemplate: mockGetEmailTemplate,
  getSmsMessage: mockGetSmsMessage,
}));

mock.module('../messaging', () => ({
  sendEmail: mockSendEmail,
  sendSms: mockSendSms,
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: mockInfo, warn: mockWarn, error: mock(() => {}), debug: mock(() => {}) },
}));

import { sendAbusiveIpAccessNotification } from './compliance-notification';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockSendEmail.mockClear();
  mockSendSms.mockClear();
  mockGetEmailTemplate.mockClear();
  mockGetSmsMessage.mockClear();
  mockInfo.mockClear();
  mockWarn.mockClear();
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

describe('sendAbusiveIpAccessNotification', () => {
  test('sends email when email is verified', async () => {
    const user = makeUser({ email: 'user@example.com', emailVerified: true });

    await sendAbusiveIpAccessNotification(user);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      'Abusive IP access notification email sent',
      expect.objectContaining({ userId: user._id.toHexString() }),
    );
  });

  test('sends SMS when phone is verified and email is absent', async () => {
    const user = makeUser({ phone: '+15551234567', phoneVerified: true });

    await sendAbusiveIpAccessNotification(user);

    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      'Abusive IP access notification SMS sent',
      expect.objectContaining({ userId: user._id.toHexString() }),
    );
  });

  test('sends both email and SMS when both channels are verified', async () => {
    const user = makeUser({
      email: 'user@example.com',
      emailVerified: true,
      phone: '+15551234567',
      phoneVerified: true,
    });

    await sendAbusiveIpAccessNotification(user);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith(
      'Abusive IP access notification email sent',
      expect.objectContaining({ userId: user._id.toHexString() }),
    );
    expect(mockInfo).toHaveBeenCalledWith(
      'Abusive IP access notification SMS sent',
      expect.objectContaining({ userId: user._id.toHexString() }),
    );
  });

  test('skips unverified channels', async () => {
    const user = makeUser({
      email: 'user@example.com',
      emailVerified: false,
      phone: '+15551234567',
      phoneVerified: false,
    });

    await sendAbusiveIpAccessNotification(user);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  test('logs warning when delivery fails', async () => {
    mockSendEmail.mockImplementationOnce(() => Promise.reject(new Error('smtp down')));
    const user = makeUser({ email: 'user@example.com', emailVerified: true });

    await sendAbusiveIpAccessNotification(user);

    expect(mockWarn).toHaveBeenCalledWith(
      'Failed to send abusive IP access notification',
      expect.objectContaining({ userId: user._id.toHexString() }),
    );
  });
});
