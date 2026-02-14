/**
 * CORS middleware
 * Adds CORS headers to responses
 */

import type { Middleware } from '../router';

export interface CorsOptions {
  origin?: string;
  credentials?: boolean;
}

/**
 * CORS middleware - adds CORS headers to responses
 */
export function cors(options: CorsOptions = {}): Middleware {
  const origin = options.origin ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const credentials = options.credentials ?? true;

  return async (_ctx, next) => {
    const response = await next();
    const headers = new Headers(response.headers);

    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', String(credentials));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
