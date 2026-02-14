/**
 * API Response Utilities Module
 * 
 * Provides standardized response formatting for consistent API responses.
 * All responses follow a unified structure with success/error indicators,
 * timestamps, and optional metadata. Supports localized error messages.
 * 
 * Response format:
 * ```json
 * {
 *   "success": true|false,
 *   "data": {...},        // Success responses only
 *   "message": "...",     // Optional success message
 *   "error": {            // Error responses only
 *     "code": "ERROR_CODE",
 *     "message": "Human readable message"
 *   },
 *   "meta": {
 *     "timestamp": "2024-01-01T00:00:00.000Z",
 *     "requestId": "uuid"  // When available
 *   }
 * }
 * ```
 * 
 * @module utils/response
 * 
 * @example
 * ```typescript
 * import { success, error, errors, localizedErrors } from './response';
 * 
 * // Success response with data
 * return success({ user: { id: 1, name: 'John' } });
 * 
 * // Error response
 * return errors.notFound('User not found');
 * 
 * // Localized error response
 * return localizedErrors.invalidOtp('es');
 * ```
 */

import { getErrorMessage, type Locale, type ErrorKey, DEFAULT_LOCALE } from '../i18n';

/**
 * Success response body structure.
 * 
 * @typeParam T - Type of the data payload
 */
export interface ApiSuccessResponse<T = unknown> {
  /** Always true for success responses */
  success: true;
  /** Optional data payload */
  data?: T;
  /** Optional success message */
  message?: string;
  /** Response metadata */
  meta?: {
    /** Request ID for tracing */
    requestId?: string;
    /** ISO timestamp of response */
    timestamp: string;
  };
}

/**
 * Error response body structure.
 */
export interface ApiErrorResponse {
  /** Always false for error responses */
  success: false;
  /** Error details */
  error: {
    /** Machine-readable error code (e.g., 'NOT_FOUND') */
    code: string;
    /** Human-readable error message */
    message: string;
  };
  /** Response metadata */
  meta?: {
    /** Request ID for tracing */
    requestId?: string;
    /** ISO timestamp of response */
    timestamp: string;
  };
}

/**
 * Union type representing any API response.
 * 
 * @typeParam T - Type of the data payload for success responses
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Creates a success JSON response.
 * 
 * Wraps the data in a standardized response format with success indicator,
 * timestamp, and optional message.
 * 
 * @typeParam T - Type of the data payload
 * @param data - Optional data to include in the response
 * @param message - Optional success message
 * @param status - HTTP status code (default: 200)
 * @returns A Response object with JSON body
 * 
 * @example
 * ```typescript
 * // Simple success (200 OK)
 * return success();
 * 
 * // Success with data
 * return success({ user: { id: 1, name: 'John' } });
 * 
 * // Success with message
 * return success({ id: 1 }, 'User created successfully', 201);
 * 
 * // Array data
 * return success([{ id: 1 }, { id: 2 }]);
 * ```
 */
export function success<T>(data?: T, message?: string, status = 200): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  if (data !== undefined) {
    body.data = data;
  }

  if (message) {
    body.message = message;
  }

  return Response.json(body, { status });
}

/**
 * Creates an error JSON response.
 * 
 * Wraps the error details in a standardized response format with error
 * code, message, and timestamp.
 * 
 * @param code - Machine-readable error code (e.g., 'VALIDATION_ERROR')
 * @param message - Human-readable error message
 * @param status - HTTP status code (default: 400)
 * @returns A Response object with JSON body
 * 
 * @example
 * ```typescript
 * // Custom error
 * return error('INVALID_TOKEN', 'The provided token is invalid', 401);
 * 
 * // Validation error
 * return error('VALIDATION_ERROR', 'Email is required');
 * ```
 */
export function error(
  code: string,
  message: string,
  status = 400
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return Response.json(body, { status });
}

/**
 * Pre-configured error response factories for common HTTP errors.
 * 
 * Each function creates a properly formatted error response with the
 * appropriate HTTP status code and error code.
 * 
 * @example
 * ```typescript
 * // 400 Bad Request
 * return errors.badRequest('Invalid email format');
 * 
 * // 401 Unauthorized
 * return errors.unauthorized('Session expired');
 * 
 * // 403 Forbidden
 * return errors.forbidden('Admin access required');
 * 
 * // 404 Not Found
 * return errors.notFound('User not found');
 * 
 * // 405 Method Not Allowed
 * return errors.methodNotAllowed('POST not supported');
 * 
 * // 429 Too Many Requests
 * return errors.rateLimited('Please try again in 60 seconds');
 * 
 * // 500 Internal Server Error
 * return errors.internal('An unexpected error occurred');
 * ```
 */
export const errors = {
  /**
   * Creates a 400 Bad Request response.
   * 
   * Use for invalid request syntax, missing required fields, or validation failures.
   * 
   * @param message - Error message (default: 'Bad request')
   * @returns Response with status 400 and code 'BAD_REQUEST'
   */
  badRequest: (message = 'Bad request') => error('BAD_REQUEST', message, 400),

  /**
   * Creates a 401 Unauthorized response.
   * 
   * Use when authentication is required but not provided or invalid.
   * 
   * @param message - Error message (default: 'Unauthorized')
   * @returns Response with status 401 and code 'UNAUTHORIZED'
   */
  unauthorized: (message = 'Unauthorized') => error('UNAUTHORIZED', message, 401),

  /**
   * Creates a 403 Forbidden response.
   * 
   * Use when the user is authenticated but lacks permission for the action.
   * 
   * @param message - Error message (default: 'Forbidden')
   * @returns Response with status 403 and code 'FORBIDDEN'
   */
  forbidden: (message = 'Forbidden') => error('FORBIDDEN', message, 403),

  /**
   * Creates a 404 Not Found response.
   * 
   * Use when the requested resource doesn't exist.
   * 
   * @param message - Error message (default: 'Not found')
   * @returns Response with status 404 and code 'NOT_FOUND'
   */
  notFound: (message = 'Not found') => error('NOT_FOUND', message, 404),

  /**
   * Creates a 405 Method Not Allowed response.
   * 
   * Use when the HTTP method is not supported for the endpoint.
   * 
   * @param message - Error message (default: 'Method not allowed')
   * @returns Response with status 405 and code 'METHOD_NOT_ALLOWED'
   */
  methodNotAllowed: (message = 'Method not allowed') => error('METHOD_NOT_ALLOWED', message, 405),

  /**
   * Creates a 429 Too Many Requests response.
   * 
   * Use when the client has exceeded rate limits.
   * 
   * @param message - Error message (default: 'Too many requests. Please try again later.')
   * @returns Response with status 429 and code 'RATE_LIMITED'
   */
  rateLimited: (message = 'Too many requests. Please try again later.') =>
    error('RATE_LIMITED', message, 429),

  /**
   * Creates a 500 Internal Server Error response.
   * 
   * Use for unexpected server errors. Avoid exposing internal details.
   * 
   * @param message - Error message (default: 'An unexpected error occurred.')
   * @returns Response with status 500 and code 'INTERNAL_ERROR'
   */
  internal: (message = 'An unexpected error occurred.') =>
    error('INTERNAL_ERROR', message, 500),

  /**
   * Creates a 413 Payload Too Large response.
   * 
   * Use when the request body exceeds size limits.
   * 
   * @param message - Error message (default: 'Payload too large')
   * @returns Response with status 413 and code 'PAYLOAD_TOO_LARGE'
   */
  payloadTooLarge: (message = 'Payload too large') =>
    error('PAYLOAD_TOO_LARGE', message, 413),
} as const;

/**
 * Creates a localized error response using the i18n system.
 * 
 * @param key - The error key from the i18n system
 * @param code - The error code for the response
 * @param status - HTTP status code
 * @param locale - The locale for the message (default: 'en')
 * @returns A Response object with JSON body
 */
export function localizedError(
  key: ErrorKey,
  code: string,
  status: number,
  locale: Locale = DEFAULT_LOCALE
): Response {
  const message = getErrorMessage(key, locale);
  return error(code, message, status);
}

/**
 * Pre-configured localized error response factories.
 * 
 * These use the i18n system for user-facing error messages, making them
 * suitable for responses that end users will see.
 * 
 * @example
 * ```typescript
 * // Get user's locale from request
 * const locale = parseAcceptLanguage(request.headers.get('Accept-Language'));
 * 
 * // Return localized error
 * return localizedErrors.invalidOtp(locale);
 * ```
 */
export const localizedErrors = {
  /** 400 - Bad request */
  badRequest: (locale?: Locale) =>
    localizedError('badRequest', 'BAD_REQUEST', 400, locale),

  /** 401 - Unauthorized */
  unauthorized: (locale?: Locale) =>
    localizedError('unauthorized', 'UNAUTHORIZED', 401, locale),

  /** 403 - Forbidden */
  forbidden: (locale?: Locale) =>
    localizedError('forbidden', 'FORBIDDEN', 403, locale),

  /** 404 - Not found */
  notFound: (locale?: Locale) =>
    localizedError('notFound', 'NOT_FOUND', 404, locale),

  /** 405 - Method not allowed */
  methodNotAllowed: (locale?: Locale) =>
    localizedError('methodNotAllowed', 'METHOD_NOT_ALLOWED', 405, locale),

  /** 429 - Rate limited */
  rateLimited: (locale?: Locale) =>
    localizedError('rateLimited', 'RATE_LIMITED', 429, locale),

  /** 500 - Internal error */
  internal: (locale?: Locale) =>
    localizedError('internal', 'INTERNAL_ERROR', 500, locale),

  /** 400 - Validation failed */
  validationFailed: (locale?: Locale) =>
    localizedError('validationFailed', 'VALIDATION_FAILED', 400, locale),

  /** 400 - Invalid email */
  invalidEmail: (locale?: Locale) =>
    localizedError('invalidEmail', 'INVALID_EMAIL', 400, locale),

  /** 400 - Invalid phone */
  invalidPhone: (locale?: Locale) =>
    localizedError('invalidPhone', 'INVALID_PHONE', 400, locale),

  /** 400 - Invalid OTP */
  invalidOtp: (locale?: Locale) =>
    localizedError('invalidOtp', 'INVALID_OTP', 400, locale),

  /** 400 - OTP expired */
  otpExpired: (locale?: Locale) =>
    localizedError('otpExpired', 'OTP_EXPIRED', 400, locale),

  /** 429 - Too many attempts */
  tooManyAttempts: (locale?: Locale) =>
    localizedError('tooManyAttempts', 'TOO_MANY_ATTEMPTS', 429, locale),

  /** 423 - Account locked */
  accountLocked: (locale?: Locale) =>
    localizedError('accountLocked', 'ACCOUNT_LOCKED', 423, locale),

  /** 401 - Session expired */
  sessionExpired: (locale?: Locale) =>
    localizedError('sessionExpired', 'SESSION_EXPIRED', 401, locale),

  /** 413 - Payload too large */
  payloadTooLarge: (locale?: Locale) =>
    localizedError('payloadTooLarge', 'PAYLOAD_TOO_LARGE', 413, locale),
} as const;
