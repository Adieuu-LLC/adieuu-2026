import { describe, expect, mock, test } from 'bun:test';

mock.module('../config', () => ({
  config: {
    env: 'test',
    security: { csrfSecret: 'test-csrf-secret' },
    cookie: { domain: '' },
  },
}));

const { csrfHeadersForSessionCookie } = await import('./csrf');
const { generateCsrfToken } = await import('../services/csrf.service');

describe('csrf test fixtures', () => {
  test('csrfHeadersForSessionCookie builds matching header and cookie', () => {
    const headers = csrfHeadersForSessionCookie('adieuu_session=sess-abc');
    const token = generateCsrfToken('sess-abc');

    expect(headers['X-CSRF-Token']).toBe(token);
    expect(headers.Cookie).toContain(`adieuu_csrf=${token}`);
    expect(headers.Cookie).toContain('adieuu_session=sess-abc');
  });

  test('csrfHeadersForSessionCookie handles grant-key session cookies', () => {
    const headers = csrfHeadersForSessionCookie('adieuu_session=sess-abc.grantKey==');
    expect(headers['X-CSRF-Token']).toBe(generateCsrfToken('sess-abc'));
  });
});
