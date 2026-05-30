/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Chat WebSocket URL */
  readonly VITE_CHAT_WS_URL?: string;
  /** LiveKit server WebSocket URL for call service */
  readonly VITE_LIVEKIT_URL?: string;
  /** Development mode */
  readonly DEV: boolean;
  /** Production mode */
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
