import { describe, expect, test, mock } from 'bun:test';

// Mock the logger before importing
mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import { getUserById, type User, type GetUserResult } from './controller';

describe('users controller', () => {
  describe('getUserById', () => {
    describe('return structure', () => {
      test('returns a GetUserResult object', async () => {
        const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');

        expect(result).toHaveProperty('success');
      });

      test('successful result includes user object', async () => {
        const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result).toHaveProperty('user');
          expect(result.user).toHaveProperty('id');
          expect(result.user).toHaveProperty('email');
          expect(result.user).toHaveProperty('name');
          expect(result.user).toHaveProperty('createdAt');
          expect(result.user).toHaveProperty('updatedAt');
        }
      });
    });

    describe('user data', () => {
      test('returns user with provided id', async () => {
        const testId = '550e8400-e29b-41d4-a716-446655440000';
        const result = await getUserById(testId);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe(testId);
        }
      });

      test('returns sanitized email', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          // Email should be lowercase and valid format
          expect(result.user.email).toBe('user@example.com');
          expect(result.user.email).toMatch(/^[a-z0-9._%+-]+@[a-z0-9.-]+$/);
        }
      });

      test('returns ISO timestamp for createdAt', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          expect(() => new Date(result.user.createdAt)).not.toThrow();
        }
      });

      test('returns ISO timestamp for updatedAt', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          expect(() => new Date(result.user.updatedAt)).not.toThrow();
        }
      });

      test('returns a name string', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(typeof result.user.name).toBe('string');
          expect(result.user.name.length).toBeGreaterThan(0);
        }
      });
    });

    describe('various id formats', () => {
      test('handles standard UUID', async () => {
        const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(true);
      });

      test('handles UUID without dashes', async () => {
        const result = await getUserById('550e8400e29b41d4a716446655440000');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe('550e8400e29b41d4a716446655440000');
        }
      });

      test('handles short id', async () => {
        const result = await getUserById('abc123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe('abc123');
        }
      });

      test('handles empty id', async () => {
        const result = await getUserById('');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe('');
        }
      });
    });

    describe('async behavior', () => {
      test('returns a Promise', () => {
        const result = getUserById('test-id');

        expect(result).toBeInstanceOf(Promise);
      });

      test('resolves to GetUserResult', async () => {
        const result = await getUserById('test-id');

        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('success');
      });
    });
  });
});
