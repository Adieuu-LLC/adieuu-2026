# Adieuu Desktop

Electron desktop app for Adieuu. Wraps the shared UI package with native capabilities including secure key storage, custom window controls, and native notifications.

## Development

```bash
# From the repo root
pnpm dev:desktop

# Or from this directory
pnpm dev
```

## Building

```bash
pnpm build       # Build renderer + main
pnpm package     # Build distributable (uses electron-builder)
```

`package:ci` runs `electron-builder --publish never` (used in GitHub Actions). Release artifacts are uploaded by the Release workflow, not by electron-builder publish. Auto-update uses the `repository` field in this `package.json` with GitHub Releases.

### Cookie and CORS bridge (main process)

The packaged app loads the UI from `adieuu://app` while the API lives on `https://api.adieuu.com` (and related hosts). Chromium would not send `SameSite=Lax` cookies on cross-site `fetch`, and WebSocket upgrades use `wss://` (a separate URL pattern from `https://`). The main process bridges **allowlisted** `https://` and `wss://` requests: it rewrites `Origin` for the packaged shell, injects cookies from the session jar, and persists `Set-Cookie` responses.

Defaults cover `api`, `ws`, `downloads`, `media`, and `status` under `adieuu.com`. You can **merge** extra hosts or **replace** the list via environment variables (see `env.example`):

- `ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS` — comma-separated `hostname` or `hostname:port` merged with defaults.
- `ADIEUU_COOKIE_BRIDGE_HOSTS` — when non-empty, replaces the default list entirely.
- `ADIEUU_ENABLE_COOKIE_BRIDGE` — in **development** (`pnpm dev`), set to `1` or `true` to enable the bridge (e.g. test `wss://` against local chat). Packaged builds enable the bridge by default.

Variables are read from `process.env` at **runtime** (the bundle does not embed them at compile time). `apps/desktop/.env` is loaded on startup when that file exists beside the main bundle. For packaged installs, set `ADIEUU_*` in the OS environment or your launcher; CI can inject the same when exercising the built binary.

## Secure Key Storage

Device encryption keys are stored in a local file under the Electron `userData` directory (e.g. `~/.config/@adieuu/desktop/secure-keys/` on Linux). When OS-level encryption is available, the file contents are additionally encrypted via Electron's `safeStorage` API:

- **macOS**: Keychain
- **Windows**: DPAPI (current user)
- **Linux**: D-Bus Secret Service (GNOME Keyring, KWallet, etc.)

### Linux Password Store

On Linux, the app auto-detects the appropriate password store backend for `safeStorage`. It first checks environment variables (`XDG_CURRENT_DESKTOP`, `KDE_SESSION_VERSION`), then falls back to probing D-Bus for available secret services (KWallet 6, KWallet 5, freedesktop Secret Service):

| Desktop | Backend |
|---------|---------|
| KDE/Plasma 6+ | `kwallet6` |
| KDE/Plasma 5 | `kwallet5` |
| GNOME, Unity, Pantheon, Cinnamon | `gnome-libsecret` |
| Other / undetected | Chromium default (libsecret via D-Bus) |

If auto-detection doesn't work for your setup, you can override it with the `ADIEUU_PASSWORD_STORE` environment variable:

```bash
# Force KWallet
ADIEUU_PASSWORD_STORE=kwallet5 pnpm dev:desktop

# Force GNOME Keyring / libsecret
ADIEUU_PASSWORD_STORE=gnome-libsecret pnpm dev:desktop

# Force basic (no OS encryption -- keys are still passphrase-encrypted)
ADIEUU_PASSWORD_STORE=basic pnpm dev:desktop
```

Valid values: `basic`, `gnome-libsecret`, `kwallet`, `kwallet5`, `kwallet6`.

You can verify whether OS-level encryption is active by opening DevTools (Ctrl+Shift+I) and running:

```js
await window.electron.secureStorage.isAvailable()
```

If this returns `true`, the key file on disk is encrypted with your OS keychain. If `false`, keys are still stored locally and survive cache clears, but are protected only by your identity passphrase.

## Architecture

```
src/
  main.ts                          # Electron main process
  preload.ts                       # Context bridge (renderer <-> main IPC)
  ipc/
    secureStorage.ts               # safeStorage + local file IPC handlers
  renderer/
    main.tsx                       # App entry point (PlatformProvider + bootstrap)
    config.ts                      # Renderer environment config
    env.d.ts                       # Type declarations (Window.electron, ImportMeta)
    platform/
      capabilities.ts             # Desktop PlatformCapabilities (IPC-backed)
      index.ts                    # Re-export
    components/
      WindowTitleBar.tsx           # Custom title bar (Windows/Linux)
```
