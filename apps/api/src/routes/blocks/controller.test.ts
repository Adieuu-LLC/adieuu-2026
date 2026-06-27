import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type {
  BlockResult,
  UnblockResult,
  BlockedIdentityInfo,
} from '../../services/block.service';

const myIdentityId = ROUTE_TEST_IDENTITY_ID;
const targetIdentityId = new ObjectId();

const blockIdentityMock = mock(async (): Promise<BlockResult> => ({ success: true }));
const unblockIdentityMock = mock(async (): Promise<UnblockResult> => ({ success: true }));
const checkIfBlockedMock = mock(
  async (): Promise<{ blocked: boolean; blockedAt?: string }> => ({ blocked: false }),
);
const getBlockedIdentitiesMock = mock(
  async (): Promise<{ blocks: BlockedIdentityInfo[]; cursor: string | null }> => ({
    blocks: [],
    cursor: null,
  }),
);
const getBlockedIdentityIdsMock = mock(async (): Promise<ObjectId[]> => []);
const isBlockedByEitherMock = mock(async () => false);

mock.module('../../services/block.service', () => ({
  blockIdentity: blockIdentityMock,
  unblockIdentity: unblockIdentityMock,
  checkIfBlocked: checkIfBlockedMock,
  getBlockedIdentities: getBlockedIdentitiesMock,
  getBlockedIdentityIds: getBlockedIdentityIdsMock,
  isBlockedByEither: isBlockedByEitherMock,
}));

import {
  postBlockResult,
  deleteBlockResult,
  getBlockedListResult,
  checkBlockedResult,
  checkBlockedEitherResult,
} from './controller';

import { blockRoutes } from './index';

blockRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string } = {},
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

describe('postBlockResult', () => {
  beforeEach(() => {
    blockIdentityMock.mockClear();
    blockIdentityMock.mockResolvedValue({ success: true });
  });

  test('returns validation_failed for malformed body', async () => {
    const r = await postBlockResult(myIdentityId, {});
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(blockIdentityMock).not.toHaveBeenCalled();
  });

  test('returns bad_request when identity id is not a valid ObjectId hex after sanitize', async () => {
    const r = await postBlockResult(myIdentityId, {
      identityId: 'gggggggggggggggggggggggg',
    });
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid identity ID.',
    });
    expect(blockIdentityMock).not.toHaveBeenCalled();
  });

  test('calls blockIdentity with sanitized id on success', async () => {
    const hex = targetIdentityId.toHexString();
    const r = await postBlockResult(myIdentityId, { identityId: hex });
    expect(r).toEqual({ ok: true });
    expect(blockIdentityMock).toHaveBeenCalledWith(myIdentityId, hex);
  });

  test('maps CANNOT_BLOCK_SELF, ALREADY_BLOCKED, IDENTITY_NOT_FOUND, and default errors', async () => {
    blockIdentityMock.mockResolvedValueOnce({ success: false, errorCode: 'CANNOT_BLOCK_SELF' });
    expect(await postBlockResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Cannot block yourself.',
    });

    blockIdentityMock.mockResolvedValueOnce({ success: false, errorCode: 'ALREADY_BLOCKED' });
    expect(await postBlockResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Identity already blocked.',
    });

    blockIdentityMock.mockResolvedValueOnce({ success: false, errorCode: 'IDENTITY_NOT_FOUND' });
    expect(await postBlockResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Identity not found.',
    });

    blockIdentityMock.mockResolvedValueOnce({ success: false, error: 'Something broke' });
    expect(await postBlockResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Something broke',
    });
  });
});

describe('deleteBlockResult', () => {
  beforeEach(() => {
    unblockIdentityMock.mockClear();
    unblockIdentityMock.mockResolvedValue({ success: true });
  });

  test('returns bad_request for invalid param', async () => {
    const r = await deleteBlockResult(myIdentityId, 'not-valid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('bad_request');
    expect(unblockIdentityMock).not.toHaveBeenCalled();
  });

  test('maps BLOCK_NOT_FOUND and generic failure', async () => {
    unblockIdentityMock.mockResolvedValueOnce({ success: false, errorCode: 'BLOCK_NOT_FOUND' });
    expect(await deleteBlockResult(myIdentityId, targetIdentityId.toHexString())).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Block not found.',
    });

    unblockIdentityMock.mockResolvedValueOnce({ success: false, error: 'nope' });
    expect(await deleteBlockResult(myIdentityId, targetIdentityId.toHexString())).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'nope',
    });
  });

  test('returns ok on success', async () => {
    const hex = targetIdentityId.toHexString();
    expect(await deleteBlockResult(myIdentityId, hex)).toEqual({ ok: true });
    expect(unblockIdentityMock).toHaveBeenCalledWith(myIdentityId, hex);
  });
});

describe('getBlockedListResult', () => {
  beforeEach(() => {
    getBlockedIdentitiesMock.mockClear();
    getBlockedIdentitiesMock.mockResolvedValue({ blocks: [], cursor: null });
  });

  test('clamps limit to 100 and defaults invalid limit to 50', async () => {
    await getBlockedListResult(myIdentityId, new URLSearchParams('limit=999'));
    expect(getBlockedIdentitiesMock).toHaveBeenCalledWith(myIdentityId, 100, undefined);

    await getBlockedListResult(myIdentityId, new URLSearchParams('limit=abc'));
    expect(getBlockedIdentitiesMock).toHaveBeenLastCalledWith(myIdentityId, 50, undefined);

    await getBlockedListResult(myIdentityId, new URLSearchParams('limit=0'));
    expect(getBlockedIdentitiesMock).toHaveBeenLastCalledWith(myIdentityId, 50, undefined);
  });

  test('passes valid cursor and omits invalid cursor', async () => {
    const hex = targetIdentityId.toHexString();
    await getBlockedListResult(myIdentityId, new URLSearchParams(`cursor=${hex}`));
    expect(getBlockedIdentitiesMock).toHaveBeenCalledWith(myIdentityId, 50, hex);

    await getBlockedListResult(myIdentityId, new URLSearchParams('cursor=invalid'));
    expect(getBlockedIdentitiesMock).toHaveBeenLastCalledWith(myIdentityId, 50, undefined);
  });

  test('returns service payload', async () => {
    const payload: { blocks: BlockedIdentityInfo[]; cursor: string | null } = {
      blocks: [],
      cursor: 'cursor-next',
    };
    getBlockedIdentitiesMock.mockResolvedValueOnce(payload);
    await expect(getBlockedListResult(myIdentityId, new URLSearchParams())).resolves.toEqual(payload);
  });
});

describe('checkBlockedResult', () => {
  beforeEach(() => {
    checkIfBlockedMock.mockClear();
    checkIfBlockedMock.mockResolvedValue({ blocked: false, blockedAt: undefined });
  });

  test('returns bad_request for invalid id', async () => {
    const r = await checkBlockedResult(myIdentityId, '!!!');
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid identity ID.',
    });
    expect(checkIfBlockedMock).not.toHaveBeenCalled();
  });

  test('returns blocked and blockedAt from service', async () => {
    checkIfBlockedMock.mockResolvedValueOnce({
      blocked: true,
      blockedAt: '2026-01-01T00:00:00.000Z',
    });
    const hex = targetIdentityId.toHexString();
    const r = await checkBlockedResult(myIdentityId, hex);
    expect(r).toEqual({
      ok: true,
      blocked: true,
      blockedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(checkIfBlockedMock).toHaveBeenCalledWith(myIdentityId, hex);
  });
});

describe('checkBlockedEitherResult', () => {
  beforeEach(() => {
    isBlockedByEitherMock.mockClear();
    checkIfBlockedMock.mockClear();
    isBlockedByEitherMock.mockResolvedValue(false);
    checkIfBlockedMock.mockResolvedValue({ blocked: false, blockedAt: undefined });
  });

  test('returns bad_request for invalid id without calling services', async () => {
    const r = await checkBlockedEitherResult(myIdentityId, 'bad');
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid identity ID.',
    });
    expect(isBlockedByEitherMock).not.toHaveBeenCalled();
    expect(checkIfBlockedMock).not.toHaveBeenCalled();
  });

  test('combines isBlockedByEither and checkIfBlocked', async () => {
    const hex = targetIdentityId.toHexString();
    isBlockedByEitherMock.mockResolvedValueOnce(true);
    checkIfBlockedMock.mockResolvedValueOnce({ blocked: true, blockedAt: '2026-01-02T00:00:00.000Z' });

    const r = await checkBlockedEitherResult(myIdentityId, hex);
    expect(r).toEqual({
      ok: true,
      blockedByEither: true,
      blockedByYou: true,
    });
    expect(isBlockedByEitherMock).toHaveBeenCalledWith(myIdentityId, hex);
    expect(checkIfBlockedMock).toHaveBeenCalledWith(myIdentityId, hex);
  });
});

describe('sanitize edge cases for ObjectId inputs', () => {
  beforeEach(() => {
    blockIdentityMock.mockClear();
    blockIdentityMock.mockResolvedValue({ success: true });
  });

  test('postBlockResult rejects id that collapses after stripping non-id characters', async () => {
    const almost = '507f1f77bcf86cd79943901!';
    expect(almost.length).toBe(24);
    const r = await postBlockResult(myIdentityId, { identityId: almost });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('bad_request');
    expect(blockIdentityMock).not.toHaveBeenCalled();
  });
});

describe('blocks routes smoke', () => {
  beforeEach(() => {
    blockIdentityMock.mockClear();
    unblockIdentityMock.mockClear();
    checkIfBlockedMock.mockClear();
    getBlockedIdentitiesMock.mockClear();
    isBlockedByEitherMock.mockClear();

    blockIdentityMock.mockResolvedValue({ success: true });
    unblockIdentityMock.mockResolvedValue({ success: true });
    checkIfBlockedMock.mockResolvedValue({ blocked: false, blockedAt: undefined });
    getBlockedIdentitiesMock.mockResolvedValue({ blocks: [], cursor: null });
  });

  test('POST /blocks returns 401 without identity session', async () => {
    const response = await blockRoutes.handler()(
      makeRequest('/blocks', {
        method: 'POST',
        body: { identityId: targetIdentityId.toHexString() },
      }),
    );
    expect(response.status).toBe(401);
  });

  test('GET /blocks returns 200 with session', async () => {
    const response = await blockRoutes.handler()(
      makeRequest('/blocks', { cookies: 'adieuu_session=session' }),
    );
    expect(response.status).toBe(200);
    expect(getBlockedIdentitiesMock).toHaveBeenCalled();
  });
});

afterAll(() => {
  mock.restore();
});
