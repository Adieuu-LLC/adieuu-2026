/**
 * Main-process environment variables (read at runtime from `process.env`).
 * Set in `apps/desktop/.env`, the shell, or the OS environment when launching the app.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * When set to a non-empty value, replaces the built-in default cookie-bridge
     * host list entirely (comma-separated hostnames or `host:port` tokens).
     */
    ADIEUU_COOKIE_BRIDGE_HOSTS?: string;
    /**
     * Comma-separated hostnames or `host:port` tokens merged with the default list.
     * Ignored when `ADIEUU_COOKIE_BRIDGE_HOSTS` is non-empty.
     */
    ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS?: string;
    /**
     * Development only: set to `1`, `true`, or `yes` to enable the cookie + CORS
     * bridge while using the Vite dev server (`http://localhost:5173`). Packaged
     * builds always enable the bridge (subject to host list).
     */
    ADIEUU_ENABLE_COOKIE_BRIDGE?: string;
  }
}
