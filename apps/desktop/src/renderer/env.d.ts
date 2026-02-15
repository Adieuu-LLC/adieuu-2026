/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL for backend requests */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
