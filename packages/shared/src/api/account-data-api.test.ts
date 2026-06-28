import { describe, expect, it } from 'bun:test';
import type { HttpClient } from './http-client';
import { AccountDataApi } from './account-data-api';

function makeClient(overrides: Partial<HttpClient> = {}): HttpClient {
  const noop = async () => ({ success: false as const, error: { code: 'X', message: 'unused' } });
  return {
    get: overrides.get ?? noop,
    post: overrides.post ?? noop,
    put: overrides.put ?? noop,
    patch: overrides.patch ?? noop,
    delete: overrides.delete ?? noop,
  };
}

describe('AccountDataApi', () => {
  it('getDataExport calls GET /api/account/data-export', async () => {
    let calledPath = '';
    const client = makeClient({
      get: async (p) => {
        calledPath = p;
        return { success: true, data: { account: {}, exportedAt: '2024-01-01' } };
      },
    });

    const api = new AccountDataApi(client);
    const res = await api.getDataExport();

    expect(calledPath).toBe('/api/account/data-export');
    expect(res.success).toBe(true);
  });

  it('requestDeletion calls POST /api/account/delete/request with empty body', async () => {
    let calledPath = '';
    let calledBody: unknown;
    const client = makeClient({
      post: async (p, body) => {
        calledPath = p;
        calledBody = body;
        return { success: true, data: { success: true } };
      },
    });

    const api = new AccountDataApi(client);
    const res = await api.requestDeletion();

    expect(calledPath).toBe('/api/account/delete/request');
    expect(calledBody).toEqual({});
    expect(res.success).toBe(true);
  });

  it('confirmDeletion calls POST /api/account/delete/confirm with code', async () => {
    let calledPath = '';
    let calledBody: unknown;
    const client = makeClient({
      post: async (p, body) => {
        calledPath = p;
        calledBody = body;
        return { success: true, data: { success: true } };
      },
    });

    const api = new AccountDataApi(client);
    const res = await api.confirmDeletion('123456');

    expect(calledPath).toBe('/api/account/delete/confirm');
    expect(calledBody).toEqual({ code: '123456' });
    expect(res.success).toBe(true);
  });

  it('propagates error responses from getDataExport', async () => {
    const client = makeClient({
      get: async () => ({
        success: false as const,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }),
    });

    const api = new AccountDataApi(client);
    const res = await api.getDataExport();

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error?.code).toBe('UNAUTHORIZED');
    }
  });

  it('propagates error responses from requestDeletion', async () => {
    const client = makeClient({
      post: async () => ({
        success: false as const,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      }),
    });

    const api = new AccountDataApi(client);
    const res = await api.requestDeletion();

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error?.code).toBe('RATE_LIMITED');
    }
  });

  it('propagates error responses from confirmDeletion', async () => {
    const client = makeClient({
      post: async () => ({
        success: false as const,
        error: { code: 'VERIFICATION_FAILED', message: 'Invalid code' },
      }),
    });

    const api = new AccountDataApi(client);
    const res = await api.confirmDeletion('000000');

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error?.code).toBe('VERIFICATION_FAILED');
    }
  });
});
