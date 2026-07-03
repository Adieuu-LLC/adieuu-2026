/**
 * Low-level HTTP client for the Adieuu API.
 */

import type { ApiResponse } from '../types';
import { API_ERROR_SESSION_EXPIRED } from '../constants/api-errors';

const CSRF_COOKIE_NAME = 'adieuu_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_ERROR_CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED';

type CaptchaHandler = () => Promise<string | null>;
let captchaHandler: CaptchaHandler | null = null;

/**
 * Registers a global handler that is invoked when any API request receives
 * a CAPTCHA_REQUIRED error. The handler should show a captcha dialog and
 * resolve with the FriendlyCaptcha response token, or `null` if cancelled.
 * The client will automatically retry the failed request with the token.
 */
export function registerCaptchaHandler(handler: CaptchaHandler): void {
  captchaHandler = handler;
}

export function clearCaptchaHandler(): void {
  captchaHandler = null;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined' || !document.cookie) {
    return undefined;
  }

  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.substring(prefix.length);
    }
  }

  return undefined;
}

export interface ApiClientConfig {
  baseUrl: string;
  /** Default headers to include in all requests */
  headers?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Inject fetch for tests or non-browser environments (defaults to `globalThis.fetch`) */
  fetchImpl?: typeof fetch;
  /**
   * Called when the API returns SESSION_EXPIRED (stale session cookie cleared server-side).
   * Use to reset local auth state and prompt sign-in.
   */
  onSessionExpired?: () => void;
}

export interface RequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Signal for aborting the request */
  signal?: AbortSignal;
}

/** Narrow surface used by domain API modules (easy to mock in tests). */
export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
}

export class ApiClient implements HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private fetchImpl: typeof fetch;
  private onSessionExpired?: () => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.timeout = config.timeout ?? 30000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.onSessionExpired = config.onSessionExpired;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
    isRetry = false,
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options?.headers,
    };

    if (MUTATING_METHODS.has(method.toUpperCase())) {
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    let fetchSignal: AbortSignal;
    if (options?.signal) {
      const anyFn = (
        AbortSignal as typeof AbortSignal & {
          any?: (signals: AbortSignal[]) => AbortSignal;
        }
      ).any;
      fetchSignal =
        typeof anyFn === 'function'
          ? anyFn([options.signal, timeoutController.signal])
          : options.signal;
    } else {
      fetchSignal = timeoutController.signal;
    }

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: fetchSignal,
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      const data = (await response.json()) as ApiResponse<T>;
      if (
        !data.success &&
        data.error?.code === API_ERROR_SESSION_EXPIRED &&
        this.onSessionExpired
      ) {
        this.onSessionExpired();
      }

      if (
        !data.success &&
        data.error?.code === API_ERROR_CAPTCHA_REQUIRED &&
        captchaHandler &&
        !isRetry
      ) {
        const token = await captchaHandler();
        if (token) {
          const retryBody = {
            ...((body as Record<string, unknown>) ?? {}),
            'frc-captcha-response': token,
          };
          return this.request<T>(method, path, retryBody, options, true);
        }
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (options?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          return {
            success: false,
            error: {
              code: 'TIMEOUT',
              message: 'Request timed out',
            },
          };
        }

        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: error.message || 'Network error',
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
        },
      };
    }
  }

  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}
