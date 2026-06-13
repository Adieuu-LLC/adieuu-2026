import { afterEach, describe, expect, test } from 'bun:test';

import {
  escapeXml,
  buildReportXml,
  buildFileDetailsXml,
  parseResponseXml,
  parseFinishResponseXml,
  parseCyberTiplineCredentials,
  CyberTiplineClient,
  CyberTiplineError,
  assertCyberTiplineEnvironment,
  CYBERTIPLINE_TEST_BASE_URL,
  CYBERTIPLINE_PROD_BASE_URL,
  type CyberTiplineReportInput,
  type CyberTiplineCredentials,
  type CyberTiplineFileDetailsInput,
} from './cybertipline.service';

// ---------------------------------------------------------------------------
// XML escaping
// ---------------------------------------------------------------------------

describe('escapeXml', () => {
  test('escapes all XML special characters', () => {
    expect(escapeXml('Tom & Jerry <"test\'>')).toBe(
      'Tom &amp; Jerry &lt;&quot;test&apos;&gt;',
    );
  });

  test('passes through safe strings unchanged', () => {
    expect(escapeXml('safe string 123')).toBe('safe string 123');
  });

  test('handles empty string', () => {
    expect(escapeXml('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// XML generation
// ---------------------------------------------------------------------------

const testCreds: CyberTiplineCredentials = {
  username: 'testuser',
  password: 'testpass',
  reporterFirstName: 'Test',
  reporterLastName: 'Reporter',
  reporterEmail: 'test@example.com',
  companyTemplate: 'Test Company Template',
  termsOfServiceUrl: 'https://example.com/tos',
  legalUrl: 'https://example.com/legal',
};

describe('buildReportXml', () => {
  test('generates valid XML with all fields', () => {
    const report: CyberTiplineReportInput = {
      incidentType: 'Child Pornography (possession, manufacture, and distribution)',
      incidentDateTime: '2026-06-01T12:00:00Z',
      additionalInfoSummary: 'Automated CSAM hash match',
      reportedPerson: {
        espIdentifier: 'identity-abc123',
        screenName: 'badactor',
        displayName: 'Bad Actor',
        bio: 'Some bio',
        ipCaptureEvents: [
          { ipAddress: '192.168.1.1', eventName: 'Upload', dateTime: '2026-06-01T12:00:00Z' },
        ],
        permanentlyDisabled: true,
        permanentlyDisabledDate: '2026-06-01T12:05:00Z',
      },
      additionalNotes: 'Internal report ID: rpt123',
    };

    const xml = buildReportXml(report, testCreds);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<incidentType>Child Pornography');
    expect(xml).toContain('<incidentDateTime>2026-06-01T12:00:00Z</incidentDateTime>');
    expect(xml).toContain('<firstName>Test</firstName>');
    expect(xml).toContain('<lastName>Reporter</lastName>');
    expect(xml).toContain('<email>test@example.com</email>');
    expect(xml).toContain('<espIdentifier>identity-abc123</espIdentifier>');
    expect(xml).toContain('<screenName>badactor</screenName>');
    expect(xml).toContain('<displayName>Bad Actor</displayName>');
    expect(xml).toContain('<ipAddress>192.168.1.1</ipAddress>');
    expect(xml).toContain('<eventName>Upload</eventName>');
    expect(xml).toContain('<permanentlyDisabled disabledDate="2026-06-01T12:05:00Z">true</permanentlyDisabled>');
    expect(xml).toContain('<additionalNotes>Internal report ID: rpt123</additionalNotes>');
    expect(xml).toContain('<companyTemplate>Test Company Template</companyTemplate>');
    expect(xml).toContain('<termsOfService>https://example.com/tos</termsOfService>');
    expect(xml).toContain('<legalURL>https://example.com/legal</legalURL>');
  });

  test('generates XML without optional fields', () => {
    const report: CyberTiplineReportInput = {
      incidentType: 'Child Pornography (possession, manufacture, and distribution)',
      incidentDateTime: '2026-06-01T12:00:00Z',
    };

    const minCreds: CyberTiplineCredentials = {
      username: 'u',
      password: 'p',
      reporterFirstName: 'A',
      reporterLastName: 'B',
      reporterEmail: 'a@b.com',
    };

    const xml = buildReportXml(report, minCreds);

    expect(xml).toContain('<incidentType>');
    expect(xml).not.toContain('<personOrUserReported>');
    expect(xml).not.toContain('<additionalNotes>');
    expect(xml).not.toContain('<companyTemplate>');
  });

  test('escapes XML-unsafe characters in user-supplied strings', () => {
    const report: CyberTiplineReportInput = {
      incidentType: 'Test',
      incidentDateTime: '2026-01-01T00:00:00Z',
      reportedPerson: {
        screenName: 'user<script>',
        displayName: 'Name & "Alias"',
      },
    };

    const xml = buildReportXml(report, testCreds);

    expect(xml).toContain('user&lt;script&gt;');
    expect(xml).toContain('Name &amp; &quot;Alias&quot;');
    expect(xml).not.toContain('<script>');
  });
});

describe('buildFileDetailsXml', () => {
  test('generates valid file details XML', () => {
    const details: CyberTiplineFileDetailsInput = {
      reportId: '12345',
      fileId: '67890',
      originalFileName: 'evidence.jpg',
      uploadedDateTime: '2026-06-01T12:00:00Z',
      ipCaptureEvent: { ipAddress: '10.0.0.1', eventName: 'Upload' },
      viewedByEsp: false,
      originalHash: { hashType: 'MD5', hashValue: 'abc123def456' },
      additionalInfo: 'Hash match info',
    };

    const xml = buildFileDetailsXml(details);

    expect(xml).toContain('<reportId>12345</reportId>');
    expect(xml).toContain('<fileId>67890</fileId>');
    expect(xml).toContain('<originalFileName>evidence.jpg</originalFileName>');
    expect(xml).toContain('<viewedByEsp>false</viewedByEsp>');
    expect(xml).toContain('hashType="MD5"');
    expect(xml).toContain('abc123def456</originalHash>');
    expect(xml).toContain('<ipAddress>10.0.0.1</ipAddress>');
  });
});

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

describe('parseResponseXml', () => {
  test('parses successful submit response', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<reportResponse>
  <responseCode>0</responseCode>
  <responseDescription>Success</responseDescription>
  <reportId>999888</reportId>
</reportResponse>`;

    const parsed = parseResponseXml(xml);
    expect(parsed.responseCode).toBe(0);
    expect(parsed.responseDescription).toBe('Success');
    expect(parsed.reportId).toBe('999888');
  });

  test('parses upload response with fileId and hash', () => {
    const xml = `<uploadResponse>
  <responseCode>0</responseCode>
  <responseDescription>File uploaded</responseDescription>
  <fileId>file-001</fileId>
  <hash>d41d8cd98f00b204e9800998ecf8427e</hash>
</uploadResponse>`;

    const parsed = parseResponseXml(xml);
    expect(parsed.responseCode).toBe(0);
    expect(parsed.fileId).toBe('file-001');
    expect(parsed.hash).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  test('parses error response', () => {
    const xml = `<reportResponse>
  <responseCode>4000</responseCode>
  <responseDescription>Authentication failed</responseDescription>
</reportResponse>`;

    const parsed = parseResponseXml(xml);
    expect(parsed.responseCode).toBe(4000);
    expect(parsed.responseDescription).toBe('Authentication failed');
    expect(parsed.reportId).toBeUndefined();
  });

  test('handles malformed XML gracefully', () => {
    const parsed = parseResponseXml('not xml at all');
    expect(parsed.responseCode).toBe(-1);
    expect(parsed.responseDescription).toBe('Unknown');
  });
});

describe('parseFinishResponseXml', () => {
  test('parses finish response with multiple file IDs', () => {
    const xml = `<finishResponse>
  <responseCode>0</responseCode>
  <reportId>12345</reportId>
  <fileId>file-001</fileId>
  <fileId>file-002</fileId>
</finishResponse>`;

    const parsed = parseFinishResponseXml(xml);
    expect(parsed.responseCode).toBe(0);
    expect(parsed.reportId).toBe('12345');
    expect(parsed.fileIds).toEqual(['file-001', 'file-002']);
  });
});

// ---------------------------------------------------------------------------
// CyberTiplineError
// ---------------------------------------------------------------------------

describe('CyberTiplineError', () => {
  test('includes step and response details', () => {
    const err = new CyberTiplineError('submit', {
      responseCode: 4000,
      responseDescription: 'Bad request',
    });

    expect(err.name).toBe('CyberTiplineError');
    expect(err.step).toBe('submit');
    expect(err.responseCode).toBe(4000);
    expect(err.message).toContain('submit failed');
    expect(err.message).toContain('4000');
  });
});

// ---------------------------------------------------------------------------
// CyberTiplineClient constructor
// ---------------------------------------------------------------------------

describe('assertCyberTiplineEnvironment', () => {
  const oldEnv = process.env.CYBERTIPLINE_ENV;

  afterEach(() => {
    if (oldEnv === undefined) delete process.env.CYBERTIPLINE_ENV;
    else process.env.CYBERTIPLINE_ENV = oldEnv;
  });

  test('allows matching test URL when CYBERTIPLINE_ENV=test', () => {
    process.env.CYBERTIPLINE_ENV = 'test';
    expect(() => assertCyberTiplineEnvironment(CYBERTIPLINE_TEST_BASE_URL)).not.toThrow();
  });

  test('throws when test env is set but production URL is used', () => {
    process.env.CYBERTIPLINE_ENV = 'test';
    expect(() => assertCyberTiplineEnvironment(CYBERTIPLINE_PROD_BASE_URL)).toThrow(/exttest/);
  });

  test('allows matching production URL when CYBERTIPLINE_ENV=production', () => {
    process.env.CYBERTIPLINE_ENV = 'production';
    expect(() => assertCyberTiplineEnvironment(CYBERTIPLINE_PROD_BASE_URL)).not.toThrow();
  });

  test('no-op when CYBERTIPLINE_ENV is unset', () => {
    delete process.env.CYBERTIPLINE_ENV;
    expect(() => assertCyberTiplineEnvironment(CYBERTIPLINE_PROD_BASE_URL)).not.toThrow();
  });
});

describe('parseCyberTiplineCredentials', () => {
  test('accepts secret JSON with all required fields', () => {
    const creds = parseCyberTiplineCredentials(
      JSON.stringify({
        username: 'user',
        password: 'pass',
        reporterFirstName: 'A',
        reporterLastName: 'B',
        reporterEmail: 'a@b.com',
      }),
    );
    expect(creds.username).toBe('user');
  });

  test('rejects secret JSON missing required fields', () => {
    expect(() =>
      parseCyberTiplineCredentials(
        JSON.stringify({
          username: 'user',
          password: 'pass',
          reporterFirstName: 'A',
          reporterLastName: 'B',
        }),
      ),
    ).toThrow(/reporterEmail/);
  });

  test('rejects empty string required fields', () => {
    expect(() =>
      parseCyberTiplineCredentials(
        JSON.stringify({
          username: 'user',
          password: '   ',
          reporterFirstName: 'A',
          reporterLastName: 'B',
          reporterEmail: 'a@b.com',
        }),
      ),
    ).toThrow(/password/);
  });
});

describe('CyberTiplineClient', () => {
  test('uses test URL by default', () => {
    const savedBaseUrl = process.env.CYBERTIPLINE_BASE_URL;
    delete process.env.CYBERTIPLINE_BASE_URL;
    try {
      const client = new CyberTiplineClient({ credentials: testCreds });
      expect(client.getBaseUrl()).toBe(CYBERTIPLINE_TEST_BASE_URL);
    } finally {
      if (savedBaseUrl === undefined) delete process.env.CYBERTIPLINE_BASE_URL;
      else process.env.CYBERTIPLINE_BASE_URL = savedBaseUrl;
    }
  });

  test('accepts custom base URL', () => {
    const client = new CyberTiplineClient({
      baseUrl: 'https://custom.example.com/ispws',
      credentials: testCreds,
    });
    expect(client.getBaseUrl()).toBe('https://custom.example.com/ispws');
  });

  test('strips trailing slash from base URL', () => {
    const client = new CyberTiplineClient({
      baseUrl: 'https://exttest.cybertip.org/ispws/',
      credentials: testCreds,
    });
    expect(client.getBaseUrl()).toBe(CYBERTIPLINE_TEST_BASE_URL);
  });

  test('getCredentials returns injected credentials', async () => {
    const client = new CyberTiplineClient({ credentials: testCreds });
    const creds = await (client as unknown as { getCredentials(): Promise<CyberTiplineCredentials> }).getCredentials();
    expect(creds.username).toBe('testuser');
  });

  test('getCredentials throws when no secret ARN and no injected creds', async () => {
    const keys = [
      'CYBERTIPLINE_USERNAME',
      'CYBERTIPLINE_PASSWORD',
      'CYBERTIPLINE_REPORTER_FIRST_NAME',
      'CYBERTIPLINE_REPORTER_LAST_NAME',
      'CYBERTIPLINE_REPORTER_EMAIL',
      'CYBERTIPLINE_TEST_USERNAME',
      'CYBERTIPLINE_TEST_PASSWORD',
      'CYBERTIPLINE_TEST_REPORTER_FIRST_NAME',
      'CYBERTIPLINE_TEST_REPORTER_LAST_NAME',
      'CYBERTIPLINE_TEST_REPORTER_EMAIL',
    ] as const;
    const saved: Partial<Record<(typeof keys)[number], string | undefined>> = {};
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }

    const client = new CyberTiplineClient();
    try {
      await (client as unknown as { getCredentials(): Promise<CyberTiplineCredentials> }).getCredentials();
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain('CYBERTIPLINE_USERNAME');
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  test('checkStatus times out when upstream does not respond', async () => {
    const savedTimeout = process.env.CYBERTIPLINE_TIMEOUT_MS;
    process.env.CYBERTIPLINE_TIMEOUT_MS = '50';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      })) as typeof fetch;

    const client = new CyberTiplineClient({ credentials: testCreds });
    try {
      await expect(client.checkStatus()).rejects.toThrow(/timed out after 50ms/);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTimeout === undefined) delete process.env.CYBERTIPLINE_TIMEOUT_MS;
      else process.env.CYBERTIPLINE_TIMEOUT_MS = savedTimeout;
    }
  });
});
