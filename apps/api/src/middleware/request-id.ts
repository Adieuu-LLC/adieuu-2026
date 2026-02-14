/**
 * Request ID middleware
 * Adds X-Request-ID header to responses for tracing
 */

import type { Middleware } from '../router';

/**
 * Adds request ID to response headers
 */
export function requestId(): Middleware {
  return async (ctx, next) => {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set('X-Request-ID', ctx.requestId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
