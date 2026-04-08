import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  env: 'development',
  email: {
    provider: 'console' as 'console' | 'ses',
    fromAddress: 'from@test.com',
    awsRegion: 'us-east-1',
    awsAccessKeyId: undefined as string | undefined,
    awsSecretAccessKey: undefined as string | undefined,
  },
};

const warnMock = mock(() => {});

mock.module('../../../config', () => ({
  config: mockConfig,
}));

mock.module('../../../utils/adieuuLogger', () => ({
  default: {
    warn: warnMock,
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import { getEmailProvider, resetEmailProviderForTests } from './index';

describe.serial('email factory (getEmailProvider)', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    resetEmailProviderForTests();
    warnMock.mockClear();
    mockConfig.env = 'development';
    mockConfig.email.provider = 'console';
    mockConfig.email.awsAccessKeyId = undefined;
    mockConfig.email.awsSecretAccessKey = undefined;
  });

  // Call provider.send directly, not the sendEmail export: other test files mock
  // ../../services/messaging and Bun can replace the live sendEmail binding shared with ./email.
  test('console provider: getEmailProvider and send', async () => {
    mockConfig.email.provider = 'console';
    const provider = getEmailProvider();
    expect(provider.name).toBe('console');
    const result = await provider.send({
      to: 'a@b.com',
      subject: 'S',
      text: 'T',
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^console-/);
  });

  test('ses with credentials uses the SES provider', () => {
    mockConfig.email.provider = 'ses';
    mockConfig.email.awsAccessKeyId = 'AKIATEST';
    mockConfig.email.awsSecretAccessKey = 'secretsecretsecretsecret';
    expect(getEmailProvider().name).toBe('ses');
  });

  test('ses without credentials in development falls back to console', () => {
    mockConfig.email.provider = 'ses';
    expect(getEmailProvider().name).toBe('console');
    expect(warnMock).toHaveBeenCalled();
  });

  test('ses without credentials in production throws', () => {
    mockConfig.email.provider = 'ses';
    mockConfig.env = 'production';
    expect(() => getEmailProvider()).toThrow('SES credentials required in production');
  });

  test('unknown email provider throws', () => {
    (mockConfig.email as { provider: string }).provider = 'bogus';
    expect(() => getEmailProvider()).toThrow('Unknown email provider: bogus');
  });
});
