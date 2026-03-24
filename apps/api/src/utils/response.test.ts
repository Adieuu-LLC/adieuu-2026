import { describe, expect, test } from 'bun:test';

import {
  success,
  error,
  errors,
  localizedErrors,
  type ApiSuccessResponse,
  type ApiErrorResponse,
} from './response';

describe('response utilities', () => {
  describe('success', () => {
    test('creates a Response object', () => {
      const response = success();
      expect(response).toBeInstanceOf(Response);
    });

    test('has default status 200', () => {
      const response = success();
      expect(response.status).toBe(200);
    });

    test('returns JSON content type', () => {
      const response = success();
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    test('body contains success: true', async () => {
      const response = success();
      const body = await response.json() as ApiSuccessResponse;
      expect(body.success).toBe(true);
    });

    test('body contains timestamp in ISO format', async () => {
      const response = success();
      const body = await response.json() as ApiSuccessResponse;
      expect(body.meta?.timestamp).toBeDefined();
      expect(body.meta?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('includes data when provided', async () => {
      const data = { id: 1, name: 'test' };
      const response = success(data);
      const body = await response.json() as ApiSuccessResponse<typeof data>;
      expect(body.data).toEqual(data);
    });

    test('does not include data key when not provided', async () => {
      const response = success();
      const body = await response.json() as ApiSuccessResponse;
      expect(body).not.toHaveProperty('data');
    });

    test('includes message when provided', async () => {
      const response = success(null, 'Operation successful');
      const body = await response.json() as ApiSuccessResponse;
      expect(body.message).toBe('Operation successful');
    });

    test('does not include message key when not provided', async () => {
      const response = success({ id: 1 });
      const body = await response.json() as ApiSuccessResponse;
      expect(body).not.toHaveProperty('message');
    });

    test('respects custom status code', async () => {
      const response = success({ id: 1 }, 'Created', 201);
      expect(response.status).toBe(201);
    });

    test('handles null data', async () => {
      const response = success(null);
      const body = await response.json() as ApiSuccessResponse;
      expect(body.data).toBeNull();
    });

    test('handles undefined data (omitted)', async () => {
      const response = success(undefined);
      const body = await response.json() as ApiSuccessResponse;
      expect(body).not.toHaveProperty('data');
    });

    test('handles array data', async () => {
      const data = [1, 2, 3];
      const response = success(data);
      const body = await response.json() as ApiSuccessResponse<number[]>;
      expect(body.data).toEqual([1, 2, 3]);
    });

    test('handles nested object data', async () => {
      const data = {
        user: { id: 1, profile: { name: 'Test' } },
        items: [{ id: 1 }, { id: 2 }],
      };
      const response = success(data);
      const body = await response.json() as ApiSuccessResponse<typeof data>;
      expect(body.data).toEqual(data);
    });

    test('handles empty string message', async () => {
      const response = success(null, '');
      const body = await response.json() as ApiSuccessResponse;
      expect(body).not.toHaveProperty('message');
    });

    test('handles boolean data', async () => {
      const response = success(true);
      const body = await response.json() as ApiSuccessResponse<boolean>;
      expect(body.data).toBe(true);
    });

    test('handles number data', async () => {
      const response = success(42);
      const body = await response.json() as ApiSuccessResponse<number>;
      expect(body.data).toBe(42);
    });

    test('handles string data', async () => {
      const response = success('hello');
      const body = await response.json() as ApiSuccessResponse<string>;
      expect(body.data).toBe('hello');
    });
  });

  describe('error', () => {
    test('creates a Response object', () => {
      const response = error('ERROR_CODE', 'Error message');
      expect(response).toBeInstanceOf(Response);
    });

    test('has default status 400', () => {
      const response = error('ERROR_CODE', 'Error message');
      expect(response.status).toBe(400);
    });

    test('returns JSON content type', () => {
      const response = error('ERROR_CODE', 'Error message');
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    test('body contains success: false', async () => {
      const response = error('ERROR_CODE', 'Error message');
      const body = await response.json() as ApiErrorResponse;
      expect(body.success).toBe(false);
    });

    test('body contains error code', async () => {
      const response = error('CUSTOM_ERROR', 'Error message');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('CUSTOM_ERROR');
    });

    test('body contains error message', async () => {
      const response = error('ERROR_CODE', 'Something went wrong');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Something went wrong');
    });

    test('body contains timestamp in ISO format', async () => {
      const response = error('ERROR_CODE', 'Error message');
      const body = await response.json() as ApiErrorResponse;
      expect(body.meta?.timestamp).toBeDefined();
      expect(body.meta?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('respects custom status code', () => {
      const response = error('NOT_FOUND', 'Resource not found', 404);
      expect(response.status).toBe(404);
    });

    test('handles empty error code', async () => {
      const response = error('', 'Error message');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('');
    });

    test('handles empty error message', async () => {
      const response = error('ERROR_CODE', '');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('');
    });

    test('handles special characters in message', async () => {
      const response = error('ERROR_CODE', 'Error with "quotes" and <brackets>');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Error with "quotes" and <brackets>');
    });

    test('handles unicode in message', async () => {
      const response = error('ERROR_CODE', 'Error: test');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Error: test');
    });
  });

  describe('errors.badRequest', () => {
    test('returns 400 status', () => {
      const response = errors.badRequest();
      expect(response.status).toBe(400);
    });

    test('has BAD_REQUEST code', async () => {
      const response = errors.badRequest();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    test('has default message', async () => {
      const response = errors.badRequest();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Bad request');
    });

    test('accepts custom message', async () => {
      const response = errors.badRequest('Invalid email format');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Invalid email format');
    });
  });

  describe('errors.unauthorized', () => {
    test('returns 401 status', () => {
      const response = errors.unauthorized();
      expect(response.status).toBe(401);
    });

    test('has UNAUTHORIZED code', async () => {
      const response = errors.unauthorized();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    test('has default message', async () => {
      const response = errors.unauthorized();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Unauthorized');
    });

    test('accepts custom message', async () => {
      const response = errors.unauthorized('Invalid token');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Invalid token');
    });
  });

  describe('errors.forbidden', () => {
    test('returns 403 status', () => {
      const response = errors.forbidden();
      expect(response.status).toBe(403);
    });

    test('has FORBIDDEN code', async () => {
      const response = errors.forbidden();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    test('has default message', async () => {
      const response = errors.forbidden();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Forbidden');
    });

    test('accepts custom message', async () => {
      const response = errors.forbidden('Access denied to this resource');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Access denied to this resource');
    });
  });

  describe('errors.notFound', () => {
    test('returns 404 status', () => {
      const response = errors.notFound();
      expect(response.status).toBe(404);
    });

    test('has NOT_FOUND code', async () => {
      const response = errors.notFound();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
    });

    test('has default message', async () => {
      const response = errors.notFound();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Not found');
    });

    test('accepts custom message', async () => {
      const response = errors.notFound('User not found');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('User not found');
    });
  });

  describe('errors.methodNotAllowed', () => {
    test('returns 405 status', () => {
      const response = errors.methodNotAllowed();
      expect(response.status).toBe(405);
    });

    test('has METHOD_NOT_ALLOWED code', async () => {
      const response = errors.methodNotAllowed();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    test('has default message', async () => {
      const response = errors.methodNotAllowed();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Method not allowed');
    });

    test('accepts custom message', async () => {
      const response = errors.methodNotAllowed('POST not supported');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('POST not supported');
    });
  });

  describe('errors.rateLimited', () => {
    test('returns 429 status', () => {
      const response = errors.rateLimited();
      expect(response.status).toBe(429);
    });

    test('has RATE_LIMITED code', async () => {
      const response = errors.rateLimited();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    test('has default message', async () => {
      const response = errors.rateLimited();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Too many requests. Please try again later.');
    });

    test('accepts custom message', async () => {
      const response = errors.rateLimited('Rate limit exceeded. Try again in 60 seconds.');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Rate limit exceeded. Try again in 60 seconds.');
    });
  });

  describe('errors.internal', () => {
    test('returns 500 status', () => {
      const response = errors.internal();
      expect(response.status).toBe(500);
    });

    test('has INTERNAL_ERROR code', async () => {
      const response = errors.internal();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    test('has default message', async () => {
      const response = errors.internal();
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('An unexpected error occurred.');
    });

    test('accepts custom message', async () => {
      const response = errors.internal('Database connection failed');
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.message).toBe('Database connection failed');
    });
  });

  describe('response structure consistency', () => {
    test('success and error responses have same meta structure', async () => {
      const successResponse = success({ id: 1 });
      const errorResponse = error('ERROR', 'message');

      const successBody = await successResponse.json() as ApiSuccessResponse;
      const errorBody = await errorResponse.json() as ApiErrorResponse;

      // Both should have meta.timestamp
      expect(successBody.meta?.timestamp).toBeDefined();
      expect(errorBody.meta?.timestamp).toBeDefined();
    });

    test('timestamps are valid ISO strings', async () => {
      const response = success();
      const body = await response.json() as ApiSuccessResponse;

      const date = new Date(body.meta?.timestamp ?? '');
      expect(date.toString()).not.toBe('Invalid Date');
    });

    test('all error helpers return proper ApiErrorResponse structure', async () => {
      const errorHelpers = [
        errors.badRequest,
        errors.unauthorized,
        errors.forbidden,
        errors.notFound,
        errors.methodNotAllowed,
        errors.rateLimited,
        errors.internal,
      ];

      for (const helper of errorHelpers) {
        const response = helper();
        const body = await response.json() as ApiErrorResponse;

        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBeDefined();
        expect(body.error.message).toBeDefined();
        expect(body.meta?.timestamp).toBeDefined();
      }
    });
  });

  describe('localizedErrors.signInRestricted', () => {
    test('returns 403 with SIGN_IN_RESTRICTED code and localized message', async () => {
      const response = localizedErrors.signInRestricted('en');
      expect(response.status).toBe(403);
      const body = await response.json() as ApiErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SIGN_IN_RESTRICTED');
      expect(body.error.message).toBe(
        'Sign-in is restricted to an allowlist. This is temporary. IYKYK.'
      );
      expect(body.meta?.timestamp).toBeDefined();
    });
  });
});
