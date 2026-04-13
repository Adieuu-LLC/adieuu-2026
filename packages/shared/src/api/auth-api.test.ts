import { describe, expect, it } from 'bun:test';
import type { HttpClient } from './http-client';
import { AuthApi } from './auth-api';

describe('AuthApi', () => {
  it('requestOtp posts to /api/auth/request', async () => {
    let path = '';
    const client: HttpClient = {
      get: async () => ({ success: false, error: { code: 'X', message: 'unused' } }),
      post: async (p, body) => {
        path = p;
        expect(body).toEqual({ identifier: 'a@b.c', type: 'email' });
        return { success: true, data: undefined };
      },
      put: async () => ({ success: false, error: { code: 'X', message: 'unused' } }),
      patch: async () => ({ success: false, error: { code: 'X', message: 'unused' } }),
      delete: async () => ({ success: false, error: { code: 'X', message: 'unused' } }),
    };

    const auth = new AuthApi(client);
    await auth.requestOtp({ identifier: 'a@b.c', type: 'email' });
    expect(path).toBe('/api/auth/request');
  });
});
