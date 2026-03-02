/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL for backend requests */
  readonly VITE_API_URL?: string;
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

interface Window {
  electron: {
    platform: NodeJS.Platform;
    versions: {
      node: string;
      chrome: string;
      electron: string;
    };
    window: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
    };
    secureStorage: {
      get: (keyId: string) => Promise<string | null>;
      set: (keyId: string, dataBase64: string) => Promise<void>;
      delete: (keyId: string) => Promise<void>;
      has: (keyId: string) => Promise<boolean>;
      list: (prefix: string) => Promise<string[]>;
      isAvailable: () => Promise<boolean>;
      status: () => Promise<{
        teeAvailable: boolean;
        teeFailed: boolean;
        lastError: string | null;
      }>;
    };
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
  };
}
