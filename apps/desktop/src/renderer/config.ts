/**
 * Desktop Renderer Configuration
 *
 * Provides type-safe access to environment variables in the renderer process.
 * Values are read from import.meta.env which is populated by electron-vite.
 *
 * Environment variables must be prefixed with VITE_ to be exposed to the renderer.
 */

/**
 * API base URL for backend requests.
 * In development, this points to the local API server.
 * In production, this should point to the production API.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/**
 * Full configuration object for type-safe access.
 */
export const config = {
  apiBaseUrl: API_BASE_URL,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export type Config = typeof config;
