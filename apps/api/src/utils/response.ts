/**
 * Standardized API response utilities
 */

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Creates a success JSON response
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
 * Creates an error JSON response
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
 * Common error responses
 */
export const errors = {
  badRequest: (message = 'Bad request') => error('BAD_REQUEST', message, 400),
  unauthorized: (message = 'Unauthorized') => error('UNAUTHORIZED', message, 401),
  forbidden: (message = 'Forbidden') => error('FORBIDDEN', message, 403),
  notFound: (message = 'Not found') => error('NOT_FOUND', message, 404),
  methodNotAllowed: (message = 'Method not allowed') => error('METHOD_NOT_ALLOWED', message, 405),
  rateLimited: (message = 'Too many requests. Please try again later.') =>
    error('RATE_LIMITED', message, 429),
  internal: (message = 'An unexpected error occurred.') =>
    error('INTERNAL_ERROR', message, 500),
} as const;
