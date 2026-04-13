import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock config
mock.module('../../config', () => ({
  config: {
    env: 'test',
    cors: { origins: '*', credentials: false },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: {
      sessionSecret: 'test-secret',
      otpSecret: 'test-otp-secret',
    },
    cookie: {
      domain: '',
    },
  },
}));

// Test session data
const mockUserId = new ObjectId();
const mockSession = {
  type: 'account' as const,
  userId: mockUserId.toHexString(),
  identifier: 'test@example.com',
  identifierType: 'email' as const,
  lastActivityAt: Date.now(),
};

// Mock session service
mock.module('../../services/session.service', () => ({
  requireAccountSession: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=')) {
      return Promise.resolve(mockSession);
    }
    return Promise.resolve(null);
  }),
}));

// Mock MFA service
const mockTotpCredentialId = new ObjectId();
const mockWebAuthnCredentialId = new ObjectId();

const mockMfaStatus = {
  enabled: false,
  totpEnabled: false,
  totpCount: 0,
  webauthnEnabled: false,
  webauthnCount: 0,
};

const mockGetMfaStatus = mock(() => Promise.resolve(mockMfaStatus));

const mockGetMfaCredentials = mock(() => Promise.resolve({
  totp: [],
  webauthn: [],
}));

const mockGenerateTotpSetup = mock(() => ({
  secret: 'JBSWY3DPEHPK3PXP',
  qrCodeUrl: 'otpauth://totp/Adieuu:test@example.com?secret=JBSWY3DPEHPK3PXP',
  manualEntryKey: 'JBSWY3DPEHPK3PXP',
}));

const mockSavePendingTotp = mock(() => Promise.resolve({
  _id: mockTotpCredentialId,
  userId: mockUserId,
  name: 'Authenticator',
  verified: false,
  createdAt: new Date(),
}));

const mockVerifyAndActivateTotp = mock(() => Promise.resolve({ success: true }));
const mockDeleteTotp = mock(() => Promise.resolve({ success: true }));

const mockGenerateWebAuthnRegistrationOptions = mock(() => Promise.resolve({
  options: {
    challenge: 'test-challenge',
    rp: { name: 'Adieuu', id: 'localhost' },
    user: { id: 'user-id', name: 'test@example.com', displayName: 'Test User' },
  },
}));

const mockVerifyWebAuthnRegistration = mock(() => Promise.resolve({
  success: true,
  credential: {
    _id: mockWebAuthnCredentialId,
    userId: mockUserId,
    name: 'Passkey',
    credentialId: Buffer.from('credential-id'),
    publicKey: Buffer.from('public-key'),
    counter: 0,
    transports: ['internal'],
    createdAt: new Date(),
  },
}));

const mockDeleteWebAuthnCredential = mock(() => Promise.resolve({ success: true }));
const mockRenameWebAuthnCredential = mock(() => Promise.resolve({ success: true }));

mock.module('../../services/mfa.service', () => ({
  getMfaStatus: mockGetMfaStatus,
  getMfaCredentials: mockGetMfaCredentials,
  generateTotpSetup: mockGenerateTotpSetup,
  savePendingTotp: mockSavePendingTotp,
  verifyAndActivateTotp: mockVerifyAndActivateTotp,
  deleteTotp: mockDeleteTotp,
  generateWebAuthnRegistrationOptions: mockGenerateWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration: mockVerifyWebAuthnRegistration,
  deleteWebAuthnCredential: mockDeleteWebAuthnCredential,
  renameWebAuthnCredential: mockRenameWebAuthnCredential,
}));

// Mock MFA models
mock.module('../../models/mfa', () => ({
  toPublicTotp: mock((cred: unknown) => ({
    id: (cred as { _id: ObjectId })._id.toHexString(),
    name: 'Authenticator',
    createdAt: new Date().toISOString(),
  })),
  toPublicWebAuthn: mock((cred: unknown) => ({
    id: (cred as { _id: ObjectId })._id.toHexString(),
    name: 'Passkey',
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  })),
}));

// Import after mocking
import mfaRoutes from './index';

describe('mfa routes', () => {
  afterAll(() => {
    mock.restore();
  });

  const makeRequest = async (
    path: string,
    options: { method?: string; body?: object; cookies?: string } = {}
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.cookies) {
      headers['Cookie'] = options.cookies;
    }

    const request = new Request(`http://localhost${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const handler = mfaRoutes.handler();
    return handler(request);
  };

  beforeEach(() => {
    mockGetMfaStatus.mockClear();
    mockGetMfaCredentials.mockClear();
    mockGenerateTotpSetup.mockClear();
    mockSavePendingTotp.mockClear();
    mockVerifyAndActivateTotp.mockClear();
    mockDeleteTotp.mockClear();
    mockGenerateWebAuthnRegistrationOptions.mockClear();
    mockVerifyWebAuthnRegistration.mockClear();
    mockDeleteWebAuthnCredential.mockClear();
    mockRenameWebAuthnCredential.mockClear();
  });

  describe('GET /mfa/status', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest('/mfa/status', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns MFA status with session', async () => {
      const response = await makeRequest('/mfa/status', {
        method: 'GET',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetMfaStatus).toHaveBeenCalledWith(mockSession.userId);
    });
  });

  describe('GET /mfa/credentials', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest('/mfa/credentials', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns MFA credentials with session', async () => {
      const response = await makeRequest('/mfa/credentials', {
        method: 'GET',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetMfaCredentials).toHaveBeenCalledWith(mockSession.userId);
    });
  });

  describe('POST /mfa/totp/setup', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest('/mfa/totp/setup', {
        method: 'POST',
        body: {},
      });

      expect(response.status).toBe(401);
    });

    test('sets up TOTP with session', async () => {
      const response = await makeRequest('/mfa/totp/setup', {
        method: 'POST',
        body: { name: 'My Authenticator' },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockGenerateTotpSetup).toHaveBeenCalledWith(mockSession.identifier);
      expect(mockSavePendingTotp).toHaveBeenCalled();

      const body = await response.json() as { data: { secret: string; qrCodeUrl: string; credentialId: string } };
      expect(body.data.secret).toBeDefined();
      expect(body.data.qrCodeUrl).toBeDefined();
      expect(body.data.credentialId).toBeDefined();
    });

    test('uses default name if not provided', async () => {
      const response = await makeRequest('/mfa/totp/setup', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockSavePendingTotp).toHaveBeenCalledWith(
        mockSession.userId,
        expect.any(String),
        'Authenticator'
      );
    });
  });

  describe('POST /mfa/totp/verify', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest('/mfa/totp/verify', {
        method: 'POST',
        body: { credentialId: mockTotpCredentialId.toHexString(), code: '123456' },
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for missing fields', async () => {
      const response = await makeRequest('/mfa/totp/verify', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns 400 for invalid code length', async () => {
      const response = await makeRequest('/mfa/totp/verify', {
        method: 'POST',
        body: { credentialId: mockTotpCredentialId.toHexString(), code: '12345' },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('verifies TOTP code', async () => {
      const response = await makeRequest('/mfa/totp/verify', {
        method: 'POST',
        body: { credentialId: mockTotpCredentialId.toHexString(), code: '123456' },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockVerifyAndActivateTotp).toHaveBeenCalled();
    });
  });

  describe('DELETE /mfa/totp/:credentialId', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest(`/mfa/totp/${mockTotpCredentialId.toHexString()}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });

    test('deletes TOTP credential', async () => {
      const response = await makeRequest(`/mfa/totp/${mockTotpCredentialId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockDeleteTotp).toHaveBeenCalledWith(
        mockTotpCredentialId.toHexString(),
        mockSession.userId
      );
    });
  });

  describe('POST /mfa/webauthn/register/start', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest('/mfa/webauthn/register/start', {
        method: 'POST',
        body: {},
      });

      expect(response.status).toBe(401);
    });

    test('starts WebAuthn registration', async () => {
      const response = await makeRequest('/mfa/webauthn/register/start', {
        method: 'POST',
        body: { name: 'My Passkey' },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockGenerateWebAuthnRegistrationOptions).toHaveBeenCalledWith(
        mockSession.userId,
        mockSession.identifier
      );

      const body = await response.json() as { data: { options: unknown; credentialName: string } };
      expect(body.data.options).toBeDefined();
      expect(body.data.credentialName).toBe('My Passkey');
    });
  });

  describe('POST /mfa/webauthn/register/finish', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest('/mfa/webauthn/register/finish', {
        method: 'POST',
        body: { response: {}, name: 'Passkey' },
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for missing response', async () => {
      const response = await makeRequest('/mfa/webauthn/register/finish', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('completes WebAuthn registration', async () => {
      const response = await makeRequest('/mfa/webauthn/register/finish', {
        method: 'POST',
        body: {
          response: { id: 'credential-id', type: 'public-key' },
          name: 'My Passkey',
        },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockVerifyWebAuthnRegistration).toHaveBeenCalled();
    });
  });

  describe('PATCH /mfa/webauthn/:credentialId', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest(`/mfa/webauthn/${mockWebAuthnCredentialId.toHexString()}`, {
        method: 'PATCH',
        body: { name: 'New Name' },
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for missing name', async () => {
      const response = await makeRequest(`/mfa/webauthn/${mockWebAuthnCredentialId.toHexString()}`, {
        method: 'PATCH',
        body: {},
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('renames WebAuthn credential', async () => {
      const response = await makeRequest(`/mfa/webauthn/${mockWebAuthnCredentialId.toHexString()}`, {
        method: 'PATCH',
        body: { name: 'New Passkey Name' },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockRenameWebAuthnCredential).toHaveBeenCalledWith(
        mockWebAuthnCredentialId.toHexString(),
        mockSession.userId,
        'New Passkey Name'
      );
    });
  });

  describe('DELETE /mfa/webauthn/:credentialId', () => {
    test('returns 401 without session', async () => {
      const response = await makeRequest(`/mfa/webauthn/${mockWebAuthnCredentialId.toHexString()}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });

    test('deletes WebAuthn credential', async () => {
      const response = await makeRequest(`/mfa/webauthn/${mockWebAuthnCredentialId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      expect(mockDeleteWebAuthnCredential).toHaveBeenCalledWith(
        mockWebAuthnCredentialId.toHexString(),
        mockSession.userId
      );
    });
  });

});
