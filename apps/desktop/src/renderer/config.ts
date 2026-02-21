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
 * WebSocket URL for chat service.
 * In development, this points to the local chat server.
 * In production, this should point to the production chat service.
 */
export const CHAT_WS_URL = import.meta.env.VITE_CHAT_WS_URL ?? 'ws://localhost:9001/ws/chat';

/**
 * Full configuration object for type-safe access.
 */
export const config = {
  apiBaseUrl: API_BASE_URL,
  chatWsUrl: CHAT_WS_URL,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export type Config = typeof config;
