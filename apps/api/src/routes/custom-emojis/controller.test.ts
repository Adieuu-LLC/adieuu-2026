/**
 * @module routes/custom-emojis/controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RouteContext, ContextErrors } from '../../router/types';
import type { IdentityContext } from '../../middleware/identity-session';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';
import type { PublicCustomEmoji } from '../../models/custom-emoji';

const VALID_ID = '507f1f77bcf86cd799439011';

const mockPublicEmoji: PublicCustomEmoji = {
  id: VALID_ID,
  identityId: ROUTE_TEST_IDENTITY_ID.toHexString(),
  shortcode: 'my_emoji',
  name: 'My emoji',
  cdnUrl: 'https://cdn.example/e.webp',
  animated: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function stubErrors(): ContextErrors {
  return {
    unauthorized: () => new Response(null, { status: 401 }),
    validationFailed: () => new Response(null, { status: 400 }),
    badRequest: () => new Response(null, { status: 400 }),
    forbidden: () => new Response(null, { status: 403 }),
    notFound: () => new Response(null, { status: 404 }),
    methodNotAllowed: () => new Response(null, { status: 405 }),
    rateLimited: () => new Response(null, { status: 429 }),
    conflict: () => new Response(null, { status: 409 }),
    internal: () => new Response(null, { status: 500 }),
    invalidEmail: () => new Response(null, { status: 400 }),
    invalidPhone: () => new Response(null, { status: 400 }),
    verificationFailed: () => new Response(null, { status: 400 }),
    invalidOtp: () => new Response(null, { status: 400 }),
    otpExpired: () => new Response(null, { status: 400 }),
    tooManyAttempts: () => new Response(null, { status: 400 }),
    accountLocked: () => new Response(null, { status: 423 }),
    sessionExpired: () => new Response(null, { status: 401 }),
    sessionExpiredWithClearCookie: () => new Response(null, { status: 401 }),
    payloadTooLarge: () => new Response(null, { status: 413 }),
    alreadyOwned: () => new Response(null, { status: 409 }),
    signInRestricted: () => new Response(null, { status: 403 }),
    accountDeleted: () => new Response(JSON.stringify({ success: false, error: { code: 'ACCOUNT_DELETED', message: 'Account deleted' } }), { status: 403 }),
  };
}

function baseSession(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    identity: { _id: ROUTE_TEST_IDENTITY_ID } as IdentityContext['identity'],
    sessionId: 'sess',
    maxVideoDurationSeconds: 300,
    subscriptions: ['access'],
    entitlements: [],
    isLifetime: false,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  const url = new URL('http://localhost/custom-emojis');
  return {
    request: new Request(url.href),
    url,
    params: {},
    query: new URLSearchParams(),
    requestId: 'rid',
    locale: 'en',
    errors: stubErrors(),
    identitySession: null,
    ...overrides,
  } as RouteContext;
}

const mockListCustomEmojis = mock(() =>
  Promise.resolve<{ success: boolean; data?: PublicCustomEmoji[]; error?: string }>({
    success: true,
    data: [],
  }),
);
const mockCreateCustomEmoji = mock(() =>
  Promise.resolve<{ success: boolean; data?: PublicCustomEmoji; error?: string; errorCode?: string }>({
    success: true,
    data: mockPublicEmoji,
  }),
);
const mockGetCustomEmoji = mock(() =>
  Promise.resolve<{ success: boolean; data?: PublicCustomEmoji; error?: string; errorCode?: string }>({
    success: true,
    data: mockPublicEmoji,
  }),
);
const mockUpdateCustomEmoji = mock(() =>
  Promise.resolve<{ success: boolean; data?: PublicCustomEmoji; error?: string; errorCode?: string }>({
    success: true,
    data: mockPublicEmoji,
  }),
);
const mockDeleteCustomEmoji = mock(() =>
  Promise.resolve<{ success: boolean; error?: string; errorCode?: string }>({ success: true }),
);

mock.module('../../services/custom-emoji.service', () => ({
  listCustomEmojis: mockListCustomEmojis,
  createCustomEmoji: mockCreateCustomEmoji,
  getCustomEmoji: mockGetCustomEmoji,
  updateCustomEmoji: mockUpdateCustomEmoji,
  deleteCustomEmoji: mockDeleteCustomEmoji,
  resolveCustomEmojiLimit: () => 10,
}));

import {
  listCustomEmojisCtrl,
  createCustomEmojiCtrl,
  getCustomEmojiCtrl,
  updateCustomEmojiCtrl,
  deleteCustomEmojiCtrl,
} from './controller';

describe('custom-emojis controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockListCustomEmojis.mockClear();
    mockCreateCustomEmoji.mockClear();
    mockGetCustomEmoji.mockClear();
    mockUpdateCustomEmoji.mockClear();
    mockDeleteCustomEmoji.mockClear();

    mockListCustomEmojis.mockImplementation(() => Promise.resolve({ success: true, data: [] }));
    mockCreateCustomEmoji.mockImplementation(() =>
      Promise.resolve({ success: true, data: mockPublicEmoji }),
    );
    mockGetCustomEmoji.mockImplementation(() =>
      Promise.resolve({ success: true, data: mockPublicEmoji }),
    );
    mockUpdateCustomEmoji.mockImplementation(() =>
      Promise.resolve({ success: true, data: mockPublicEmoji }),
    );
    mockDeleteCustomEmoji.mockImplementation(() => Promise.resolve({ success: true }));
  });

  describe('listCustomEmojisCtrl', () => {
    test('returns 401 without identity session', async () => {
      const r = await listCustomEmojisCtrl(baseCtx());
      expect(r.status).toBe(401);
      expect(mockListCustomEmojis).not.toHaveBeenCalled();
    });

    test('returns emojis, limit, and used on success', async () => {
      mockListCustomEmojis.mockResolvedValue({ success: true, data: [mockPublicEmoji] });
      const r = await listCustomEmojisCtrl(
        baseCtx({ identitySession: baseSession() }),
      );
      expect(r.status).toBe(200);
      const body = (await r.json()) as {
        success: boolean;
        data: { emojis: PublicCustomEmoji[]; limit: number; used: number };
      };
      expect(body.success).toBe(true);
      expect(body.data.emojis).toHaveLength(1);
      expect(body.data.limit).toBe(10);
      expect(body.data.used).toBe(1);
      expect(mockListCustomEmojis).toHaveBeenCalledWith(ROUTE_TEST_IDENTITY_ID.toHexString());
    });

    test('returns 500 when list service fails', async () => {
      mockListCustomEmojis.mockResolvedValue({ success: false, error: 'db' });
      const r = await listCustomEmojisCtrl(
        baseCtx({ identitySession: baseSession() }),
      );
      expect(r.status).toBe(500);
    });
  });

  describe('createCustomEmojiCtrl', () => {
    test('returns 401 without identity session', async () => {
      const r = await createCustomEmojiCtrl(
        baseCtx({ body: { shortcode: 'ab', name: 'N', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' } }),
      );
      expect(r.status).toBe(401);
      expect(mockCreateCustomEmoji).not.toHaveBeenCalled();
    });

    test('returns 400 on invalid Zod body', async () => {
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: { shortcode: 'a', name: 'N', mediaId: 'x' },
        }),
      );
      expect(r.status).toBe(400);
      expect(mockCreateCustomEmoji).not.toHaveBeenCalled();
    });

    test('returns 400 when sanitization shortens shortcode below minimum', async () => {
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: {
            shortcode: 'a ',
            name: 'Ok',
            mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          },
        }),
      );
      expect(r.status).toBe(400);
      expect(mockCreateCustomEmoji).not.toHaveBeenCalled();
    });

    test('returns 400 when name is empty after sanitize', async () => {
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: {
            shortcode: 'ab',
            name: '   ',
            mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          },
        }),
      );
      expect(r.status).toBe(400);
      expect(mockCreateCustomEmoji).not.toHaveBeenCalled();
    });

    test('returns 201 and passes sanitized fields to service', async () => {
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: {
            shortcode: 'My_Emoji',
            name: '  Label  ',
            mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          },
        }),
      );
      expect(r.status).toBe(201);
      expect(mockCreateCustomEmoji).toHaveBeenCalledWith({
        identityId: ROUTE_TEST_IDENTITY_ID.toHexString(),
        shortcode: 'My_Emoji',
        name: 'Label',
        mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        subscriptions: ['access'],
        isLifetime: false,
      });
    });

    test('maps LIMIT_REACHED to 403', async () => {
      mockCreateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'limit',
        errorCode: 'LIMIT_REACHED',
      });
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: { shortcode: 'ab', name: 'N', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        }),
      );
      expect(r.status).toBe(403);
    });

    test('maps SUBSCRIPTION_REQUIRED to 403', async () => {
      mockCreateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'sub',
        errorCode: 'SUBSCRIPTION_REQUIRED',
      });
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: { shortcode: 'ab', name: 'N', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        }),
      );
      expect(r.status).toBe(403);
    });

    test('maps SHORTCODE_TAKEN to 409', async () => {
      mockCreateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'taken',
        errorCode: 'SHORTCODE_TAKEN',
      });
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: { shortcode: 'ab', name: 'N', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        }),
      );
      expect(r.status).toBe(409);
    });

    test('maps SHORTCODE_CONFLICT to 409', async () => {
      mockCreateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'conflict',
        errorCode: 'SHORTCODE_CONFLICT',
      });
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: { shortcode: 'ab', name: 'N', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        }),
      );
      expect(r.status).toBe(409);
    });

    test('maps other error codes to 400', async () => {
      mockCreateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'bad',
        errorCode: 'INVALID_SHORTCODE',
      });
      const r = await createCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          body: { shortcode: 'ab', name: 'N', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        }),
      );
      expect(r.status).toBe(400);
    });
  });

  describe('getCustomEmojiCtrl', () => {
    test('returns 401 without identity session', async () => {
      const r = await getCustomEmojiCtrl(baseCtx({ params: { id: VALID_ID } }));
      expect(r.status).toBe(401);
    });

    test('returns 400 for invalid id', async () => {
      const r = await getCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: 'not-hex!!!' },
        }),
      );
      expect(r.status).toBe(400);
      expect(mockGetCustomEmoji).not.toHaveBeenCalled();
    });

    test('accepts ObjectId hex after stripping zero-width joiner', async () => {
      const dirty = `${VALID_ID.slice(0, 12)}\u200d${VALID_ID.slice(12)}`;
      await getCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: dirty },
        }),
      );
      expect(mockGetCustomEmoji).toHaveBeenCalledWith(
        VALID_ID,
        ROUTE_TEST_IDENTITY_ID.toHexString(),
      );
    });

    test('returns 404 when not found', async () => {
      mockGetCustomEmoji.mockResolvedValue({
        success: false,
        error: 'missing',
        errorCode: 'NOT_FOUND',
      });
      const r = await getCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
        }),
      );
      expect(r.status).toBe(404);
    });
  });

  describe('updateCustomEmojiCtrl', () => {
    test('returns 400 on invalid route id', async () => {
      const r = await updateCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: 'bad' },
          body: { name: 'New' },
        }),
      );
      expect(r.status).toBe(400);
      expect(mockUpdateCustomEmoji).not.toHaveBeenCalled();
    });

    test('returns 400 when Zod refine fails (no fields)', async () => {
      const r = await updateCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
          body: {},
        }),
      );
      expect(r.status).toBe(400);
    });

    test('returns 400 when optional shortcode too short after sanitize', async () => {
      const r = await updateCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
          body: { shortcode: 'x ' },
        }),
      );
      expect(r.status).toBe(400);
    });

    test('sanitizes name only patch and calls service', async () => {
      await updateCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
          body: { name: '  Renamed  ' },
        }),
      );
      expect(mockUpdateCustomEmoji).toHaveBeenCalledWith({
        emojiId: VALID_ID,
        identityId: ROUTE_TEST_IDENTITY_ID.toHexString(),
        shortcode: undefined,
        name: 'Renamed',
      });
    });

    test('returns 403 for NOT_OWNER', async () => {
      mockUpdateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'nope',
        errorCode: 'NOT_OWNER',
      });
      const r = await updateCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
          body: { name: 'X' },
        }),
      );
      expect(r.status).toBe(403);
    });

    test('returns 404 for NOT_FOUND', async () => {
      mockUpdateCustomEmoji.mockResolvedValue({
        success: false,
        error: 'gone',
        errorCode: 'NOT_FOUND',
      });
      const r = await updateCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
          body: { name: 'X' },
        }),
      );
      expect(r.status).toBe(404);
    });
  });

  describe('deleteCustomEmojiCtrl', () => {
    test('returns 400 for bad id', async () => {
      const r = await deleteCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: '!!!' },
        }),
      );
      expect(r.status).toBe(400);
    });

    test('returns 204 on success', async () => {
      const r = await deleteCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
        }),
      );
      expect(r.status).toBe(204);
    });

    test('returns 403 for NOT_OWNER', async () => {
      mockDeleteCustomEmoji.mockResolvedValue({
        success: false,
        error: 'nope',
        errorCode: 'NOT_OWNER',
      });
      const r = await deleteCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
        }),
      );
      expect(r.status).toBe(403);
    });

    test('returns 404 for NOT_FOUND', async () => {
      mockDeleteCustomEmoji.mockResolvedValue({
        success: false,
        error: 'gone',
        errorCode: 'NOT_FOUND',
      });
      const r = await deleteCustomEmojiCtrl(
        baseCtx({
          identitySession: baseSession(),
          params: { id: VALID_ID },
        }),
      );
      expect(r.status).toBe(404);
    });
  });
});
