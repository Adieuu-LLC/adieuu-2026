import { describe, expect, beforeEach, test } from 'bun:test';
import { mockShell } from '../test/electron-mock';

const { openExternalHttpsUrl } = await import('./open-external-https');

describe('openExternalHttpsUrl', () => {
  beforeEach(() => {
    mockShell.openExternal.mockClear();
  });

  test('rejects empty string', async () => {
    const r = await openExternalHttpsUrl('');
    expect(r).toEqual({ ok: false, error: 'Invalid URL' });
    expect(mockShell.openExternal).not.toHaveBeenCalled();
  });

  test('rejects non-https protocol', async () => {
    const r = await openExternalHttpsUrl('http://example.com/pay');
    expect(r).toEqual({ ok: false, error: 'Only https URLs are allowed' });
    expect(mockShell.openExternal).not.toHaveBeenCalled();
  });

  test('rejects javascript: URLs', async () => {
    const r = await openExternalHttpsUrl('javascript:alert(1)');
    expect(r.ok).toBe(false);
    expect(mockShell.openExternal).not.toHaveBeenCalled();
  });

  test('opens https URLs via shell.openExternal', async () => {
    const r = await openExternalHttpsUrl('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(r).toEqual({ ok: true });
    expect(mockShell.openExternal).toHaveBeenCalledTimes(1);
    expect(mockShell.openExternal.mock.calls[0]?.[0]).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_123',
    );
  });
});
