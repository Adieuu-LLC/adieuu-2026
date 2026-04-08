import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig: {
  email: {
    fromAddress: string;
    awsRegion: string;
    awsAccessKeyId: string | undefined;
    awsSecretAccessKey: string | undefined;
  };
} = {
  email: {
    fromAddress: 'sender@example.com',
    awsRegion: 'us-east-1',
    awsAccessKeyId: 'AKIATESTACCESSKEY',
    awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
};

mock.module('../../../config', () => ({
  config: mockConfig,
}));

mock.module('../../../utils/adieuuLogger', () => ({
  default: {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import { SesEmailProvider } from './ses.provider';

describe('SesEmailProvider', () => {
  afterAll(() => {
    mock.restore();
  });

  const origFetch = globalThis.fetch;
  const RealDate = Date;

  beforeEach(() => {
    const FixedDate = class extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(RealDate.UTC(2020, 0, 2, 3, 4, 5));
        } else {
          super(...(args as ConstructorParameters<typeof Date>));
        }
      }
    } as DateConstructor;
    globalThis.Date = FixedDate;
  });

  afterEach(() => {
    globalThis.Date = RealDate;
    globalThis.fetch = origFetch;
  });

  test('isConfigured is false when credentials are missing', () => {
    const origA = mockConfig.email.awsAccessKeyId;
    const origS = mockConfig.email.awsSecretAccessKey;
    try {
      mockConfig.email.awsAccessKeyId = undefined;
      mockConfig.email.awsSecretAccessKey = undefined;
      expect(new SesEmailProvider().isConfigured()).toBe(false);
    } finally {
      mockConfig.email.awsAccessKeyId = origA;
      mockConfig.email.awsSecretAccessKey = origS;
    }
  });

  test('send returns error without calling fetch when not configured', async () => {
    const origA = mockConfig.email.awsAccessKeyId;
    const origS = mockConfig.email.awsSecretAccessKey;
    const fetchSpy = mock(() =>
      Promise.resolve(new Response('', { status: 200 }))
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      mockConfig.email.awsAccessKeyId = undefined;
      mockConfig.email.awsSecretAccessKey = undefined;
      const provider = new SesEmailProvider();
      const result = await provider.send({
        to: 'to@example.com',
        subject: 'S',
        text: 'T',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      mockConfig.email.awsAccessKeyId = origA;
      mockConfig.email.awsSecretAccessKey = origS;
    }
  });

  test('send posts to regional SES endpoint with SigV4 headers and parses MessageId', async () => {
    const fetchSpy = mock(
      async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe('https://email.us-east-1.amazonaws.com/');
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(headers['Host']).toBe('email.us-east-1.amazonaws.com');
        expect(headers['X-Amz-Date']).toBe('20200102T030405Z');
        expect(headers['Authorization']).toMatch(
          /^AWS4-HMAC-SHA256 Credential=AKIATESTACCESSKEY\/20200102\/us-east-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[a-f0-9]{64}$/
        );
        const body = init?.body as string;
        expect(body).toContain('Action=SendEmail');
        expect(body).toContain('Source=sender%40example.com');
        expect(body).toContain('Destination.ToAddresses.member.1=to%40example.com');
        expect(body).toContain('Message.Subject.Data=Hello');
        expect(body).toContain('Message.Body.Text.Data=Plain');
        expect(body).toContain('Message.Body.Html.Data=%3Cp%3EHi%3C%2Fp%3E');

        return new Response(
          '<?xml version="1.0"?><SendEmailResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/"><SendEmailResult><MessageId>abc-123-msg</MessageId></SendEmailResult></SendEmailResponse>',
          { status: 200 }
        );
      }
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new SesEmailProvider();
    const result = await provider.send({
      to: 'to@example.com',
      subject: 'Hello',
      text: 'Plain',
      html: '<p>Hi</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('abc-123-msg');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('send returns failure when SES responds with non-OK status', async () => {
    globalThis.fetch = (async () =>
      new Response('error body', { status: 403 })) as unknown as typeof fetch;

    const provider = new SesEmailProvider();
    const result = await provider.send({
      to: 'to@example.com',
      subject: 'S',
      text: 'T',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  test('exposes name ses', () => {
    expect(new SesEmailProvider().name).toBe('ses');
  });
});
