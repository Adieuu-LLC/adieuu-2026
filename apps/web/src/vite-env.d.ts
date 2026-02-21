/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Chat WebSocket URL */
  readonly VITE_CHAT_WS_URL?: string;
  /** Development mode */
  readonly DEV: boolean;
  /** Production mode */
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
