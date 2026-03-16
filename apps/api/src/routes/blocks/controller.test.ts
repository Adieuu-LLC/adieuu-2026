import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { BlockResult, UnblockResult } from '../../services/block.service';

const myIdentityId = new ObjectId();
const targetIdentityId = new ObjectId();

const getIdentitySessionIdFromRequestMock = mock((request: Request) => {
  const cookie = request.headers.get('Cookie') ?? '';
  return cookie.includes('adieuu_identity=') ? 'identity-session' : null;
});
const getIdentityFromSessionMock = mock(async () => ({
  _id: myIdentityId,
  username: 'me',
}));

const blockIdentityMock = mock(async (): Promise<BlockResult> => ({ success: true }));
const unblockIdentityMock = mock(async (): Promise<UnblockResult> => ({ success: true }));
const checkIfBlockedMock = mock(async () => ({ blocked: false, blockedAt: null as string | null }));
const getBlockedIdentitiesMock = mock(async () => ({ blocks: [], cursor: null as string | null }));

mock.module('../../services/identity.service', () => ({
  getIdentitySessionIdFromRequest: getIdentitySessionIdFromRequestMock,
  getIdentityFromSession: getIdentityFromSessionMock,
}));

mock.module('../../services/block.service', () => ({
  blockIdentity: blockIdentityMock,
  unblockIdentity: unblockIdentityMock,
  checkIfBlocked: checkIfBlockedMock,
  getBlockedIdentities: getBlockedIdentitiesMock,
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({}),
}));

mock.module('../../models/identity', () => ({
  toPublicIdentity: (x: unknown) => x,
}));

import { blockRoutes } from './index';

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe('blocks routes', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    getIdentitySessionIdFromRequestMock.mockClear();
    getIdentityFromSessionMock.mockClear();
    blockIdentityMock.mockClear();
    unblockIdentityMock.mockClear();
    checkIfBlockedMock.mockClear();
    getBlockedIdentitiesMock.mockClear();

    getIdentityFromSessionMock.mockResolvedValue({ _id: myIdentityId, username: 'me' });
    blockIdentityMock.mockResolvedValue({ success: true });
    unblockIdentityMock.mockResolvedValue({ success: true });
    checkIfBlockedMock.mockResolvedValue({ blocked: false, blockedAt: null });
    getBlockedIdentitiesMock.mockResolvedValue({ blocks: [], cursor: null });
  });

  test('POST /blocks requires identity session', async () => {
    const response = await blockRoutes.handler()(makeRequest('/blocks', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
    }));
    expect(response.status).toBe(401);
  });

  test('POST /blocks validates identityId and maps service errors', async () => {
    const invalid = await blockRoutes.handler()(makeRequest('/blocks', {
      method: 'POST',
      body: { identityId: 'invalid' },
      cookies: 'adieuu_identity=session',
    }));
    expect(invalid.status).toBe(400);

    blockIdentityMock.mockResolvedValueOnce({ success: false, errorCode: 'CANNOT_BLOCK_SELF' });
    const selfBlock = await blockRoutes.handler()(makeRequest('/blocks', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
      cookies: 'adieuu_identity=session',
    }));
    expect(selfBlock.status).toBe(400);
  });

  test('DELETE /blocks/:identityId validates and maps not-found', async () => {
    const invalid = await blockRoutes.handler()(makeRequest('/blocks/invalid', {
      method: 'DELETE',
      cookies: 'adieuu_identity=session',
    }));
    expect(invalid.status).toBe(400);

    unblockIdentityMock.mockResolvedValueOnce({ success: false, errorCode: 'BLOCK_NOT_FOUND' });
    const missing = await blockRoutes.handler()(makeRequest(`/blocks/${targetIdentityId.toHexString()}`, {
      method: 'DELETE',
      cookies: 'adieuu_identity=session',
    }));
    expect(missing.status).toBe(404);
  });

  test('GET /blocks normalizes limit and passes cursor', async () => {
    await blockRoutes.handler()(makeRequest('/blocks?limit=999&cursor=invalid', {
      cookies: 'adieuu_identity=session',
    }));
    expect(getBlockedIdentitiesMock).toHaveBeenCalledWith(myIdentityId, 100, undefined);
  });

  test('GET /blocks/check/:identityId validates input and returns status', async () => {
    const invalid = await blockRoutes.handler()(makeRequest('/blocks/check/not-an-id', {
      cookies: 'adieuu_identity=session',
    }));
    expect(invalid.status).toBe(400);

    checkIfBlockedMock.mockResolvedValueOnce({ blocked: true, blockedAt: '2026-01-01T00:00:00.000Z' });
    const response = await blockRoutes.handler()(makeRequest(`/blocks/check/${targetIdentityId.toHexString()}`, {
      cookies: 'adieuu_identity=session',
    }));
    expect(response.status).toBe(200);
    expect(checkIfBlockedMock).toHaveBeenCalledWith(myIdentityId, targetIdentityId.toHexString());
  });
});

