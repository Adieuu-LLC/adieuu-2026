import { describe, expect, it } from 'bun:test';
import { ApiClient } from './http-client';

describe('ApiClient', () => {
  it('returns success payload from JSON response', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ success: true, data: { id: 'x' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const res = await client.get<{ id: string }>('/api/foo');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe('x');
    }
  });

  it('maps AbortError to TIMEOUT', async () => {
    const fetchImpl: typeof fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const res = await client.get('/api/foo');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('TIMEOUT');
    }
  });

  it('maps generic Error to NETWORK_ERROR', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('boom');
    };

    const client = new ApiClient({
      baseUrl: 'http://example.test',
      fetchImpl,
      timeout: 5000,
    });

    const res = await client.get('/api/foo');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('NETWORK_ERROR');
      expect(res.error.message).toContain('boom');
    }
  });
});
