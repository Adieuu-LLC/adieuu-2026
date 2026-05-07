/**
 * @module routes/identity/profile.controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Locale } from '../../i18n';
import type { RouteContext } from '../../router/types';
import { ObjectId } from 'mongodb';

const identityOid = new ObjectId('507f1f77bcf86cd799439011');
const identityHex = identityOid.toHexString();

mock.module('../../services/achievement.service', () => ({
  checkAndAward: mock(() => Promise.resolve()),
}));

mock.module('../../services/profile-event.service', () => ({
  publishProfileUpdated: mock(() => Promise.resolve()),
}));

const mockFriendshipsFindOne = mock(() => Promise.resolve(null));

mock.module('../../db', () => ({
  getCollection: () => ({
    findOne: mockFriendshipsFindOne,
  }),
  Collections: {
    FRIENDSHIPS: 'friendships',
  },
}));

const mockIdentityDoc = {
  _id: identityOid,
  ident: 'h',
  hashVersion: 1,
  username: 'u',
  displayName: 'D',
  bio: undefined as string | undefined,
  avatarUrl: undefined as string | undefined,
  bannerUrl: undefined as string | undefined,
  profileColors: undefined,
  privacySettings: undefined,
  preferredCryptoProfile: undefined,
  signingPublicKey: undefined,
  devices: [] as [],
  requireGroupApproval: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
};

const mockFindByIdentityIdProfile = mock(() => Promise.resolve(mockIdentityDoc));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockFindByIdentityIdProfile,
    updateByIdent: mock(() => Promise.resolve(mockIdentityDoc)),
  }),
}));

const mockFindMediaById = mock(() => Promise.resolve(null as never));

mock.module('../../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    findByMediaIdAndIdentity: mockFindMediaById,
  }),
}));

import { getProfileCtrl, updateProfileCtrl } from './profile.controller';

afterAll(() => {
  mock.restore();
});

function makeErrors(): RouteContext['errors'] {
  return {
    badRequest: () => new Response(null, { status: 400 }),
    unauthorized: () => new Response(null, { status: 401 }),
    forbidden: () => new Response(null, { status: 403 }),
    notFound: () => new Response(null, { status: 404 }),
    methodNotAllowed: () => new Response(null, { status: 405 }),
    rateLimited: () => new Response(null, { status: 429 }),
    conflict: () => new Response(null, { status: 409 }),
    internal: () => new Response(null, { status: 500 }),
    validationFailed: () => new Response(null, { status: 400 }),
    invalidEmail: () => new Response(null, { status: 400 }),
    invalidPhone: () => new Response(null, { status: 400 }),
    verificationFailed: () => new Response(null, { status: 400 }),
    invalidOtp: () => new Response(null, { status: 400 }),
    otpExpired: () => new Response(null, { status: 400 }),
    tooManyAttempts: () => new Response(null, { status: 400 }),
    accountLocked: () => new Response(null, { status: 403 }),
    sessionExpired: () => new Response(null, { status: 401 }),
    sessionExpiredWithClearCookie: () => new Response(null, { status: 401 }),
    payloadTooLarge: () => new Response(null, { status: 413 }),
    alreadyOwned: () => new Response(null, { status: 409 }),
    signInRestricted: () => new Response(null, { status: 403 }),
  };
}

describe('profile.controller', () => {
  beforeEach(() => {
    mockFindByIdentityIdProfile.mockReset();
    mockFindMediaById.mockReset();
    mockFindByIdentityIdProfile.mockImplementation(() => Promise.resolve(mockIdentityDoc));
  });

  test('getProfileCtrl returns 400 for invalid identity id string', async () => {
    const req = new Request('http://x/');
    const ctx: RouteContext = {
      request: req,
      url: new URL(req.url),
      params: { id: 'zzz' },
      query: new URLSearchParams(),
      requestId: 't',
      locale: 'en' as Locale,
      errors: makeErrors(),
      identitySession: null,
    };
    const res = await getProfileCtrl(ctx);
    expect(res.status).toBe(400);
    expect(mockFindByIdentityIdProfile).not.toHaveBeenCalled();
  });

  test('getProfileCtrl loads by sanitized canonical id', async () => {
    const withZw =
      identityHex.slice(0, 12) + '\u200b' + identityHex.slice(12);
    const req = new Request('http://x/');
    const ctx: RouteContext = {
      request: req,
      url: new URL(req.url),
      params: { id: withZw },
      query: new URLSearchParams(),
      requestId: 't',
      locale: 'en' as Locale,
      errors: makeErrors(),
      identitySession: null,
    };
    await getProfileCtrl(ctx);
    expect(mockFindByIdentityIdProfile).toHaveBeenCalledWith(identityHex);
  });

  test('updateProfileCtrl returns 401 without identity session', async () => {
    const req = new Request('http://x/');
    const ctx: RouteContext = {
      request: req,
      url: new URL(req.url),
      params: {},
      query: new URLSearchParams(),
      requestId: 't',
      locale: 'en' as Locale,
      errors: makeErrors(),
      identitySession: null,
      body: { displayName: 'Hi' },
    };
    expect((await updateProfileCtrl(ctx)).status).toBe(401);
  });

  test('updateProfileCtrl uses sanitized idenhanced avatar media id for lookup', async () => {
    const mid = `media_xyz\u200d`;
    const req = new Request('http://x/');
    const ctx: RouteContext = {
      request: req,
      url: new URL(req.url),
      params: {},
      query: new URLSearchParams(),
      requestId: 't',
      locale: 'en' as Locale,
      errors: makeErrors(),
      identitySession: {
        identity: {
          _id: identityOid,
          ident: 'h',
          username: 'u',
          displayName: 'D',
          privacySettings: undefined,
          profileColors: undefined,
        } as never,
        sessionId: 's',
        maxVideoDurationSeconds: 300,
        subscriptions: [],
        entitlements: [],
        isLifetime: false,
      },
      body: { avatarMediaId: mid },
    };
    mockFindMediaById.mockImplementation(() =>
      Promise.resolve({
        mediaId: 'media_xyz',
        status: 'ready',
        cdnUrl: 'https://cdn/x',
        purpose: 'avatar',
      } as never),
    );
    await updateProfileCtrl(ctx);
    expect(mockFindMediaById).toHaveBeenCalledWith('media_xyz', identityHex);
  });
});
