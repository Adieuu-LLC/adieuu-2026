/**
 * API Response Utilities Module
 * 
 * Provides standardized response formatting for consistent API responses.
 * All responses follow a unified structure with success/error indicators,
 * timestamps, and optional metadata.
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
 * import { success, error, errors } from './response';
 * 
 * // Success response with data
 * return success({ user: { id: 1, name: 'John' } });
 * 
 * // Error response
 * return errors.notFound('User not found');
 * ```
 */

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
} as const;
