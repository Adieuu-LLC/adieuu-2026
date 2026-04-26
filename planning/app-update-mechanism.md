# App Update Mechanism

Inline update support for both the web app and the Electron desktop app. The web app polls for new versions and prompts the user to refresh. The desktop app uses electron-updater to download and apply updates from GitHub Releases, with differential downloads on Windows and macOS.

**Goal:** Users are notified of new versions without leaving the app and can update with minimal friction -- a page refresh on web, or an app restart on desktop.

**Dependencies:** Existing GitHub Release workflow, electron-builder packaging, Vite build pipeline.

---

## 1. Web App Updates

### 1.1 How It Works

The web app is a Vite-built SPA. Vite produces content-hashed filenames for all JS/CSS chunks (e.g. `index-a3b2c1d4.js`). When a new version is deployed, the server has new files with new hashes, but existing browser tabs still run the old bundle.

Update detection:

1. **Build time:** Vite injects the current version into the JS bundle as `__APP_VERSION__` (from `package.json`). A small Vite plugin also writes a `version.json` file to `dist/` containing `{ "version": "x.y.z" }`.

2. **Runtime polling:** A `useUpdateCheck` hook fetches `/version.json` every ~60 seconds with a cache-busting query parameter (`?t=<timestamp>`) to bypass CDN/proxy caches. It compares the fetched version string against the build-time `__APP_VERSION__`.

3. **Notification:** When the versions differ, a non-intrusive banner appears: "A new version of Adieuu is available. [Refresh] [Later]".

4. **Refresh:** Clicking "Refresh" calls `window.location.reload()`. The browser fetches the new `index.html` from the server, which references the new content-hashed assets. Old cached chunks are irrelevant because their filenames no longer appear in the HTML.

### 1.2 Why This Works Without Cache Busting

Vite's content-hashing strategy means every build produces unique filenames for changed files. The critical requirement is that `index.html` itself is served with appropriate cache headers (`no-cache` or short `max-age`), which is the default behaviour for Caddy serving HTML. Since the HTML is always fresh, it points to the correct hashed assets, and a simple `reload()` picks up the new version.

There is no service worker involved. No manual cache clearing is needed.

### 1.3 Polling Details

- **Interval:** 60 seconds (configurable).
- **Cache busting:** `fetch('/version.json?t=' + Date.now())` prevents stale responses from intermediate caches.
- **Platform guard:** Polling is skipped on the desktop platform, where electron-updater handles updates instead.
- **Dismissal:** The user can dismiss the banner. It will not reappear until the next version change or the next page load.
- **Failure handling:** If the fetch fails (network error, 404), the hook silently retries on the next interval. No error is surfaced to the user.

### 1.4 Security Considerations

- `version.json` contains only a version string. No sensitive data is exposed.
- No user data is transmitted during the polling request.
- The fetch uses the same origin, so it is subject to the same CORS/CSP policies as the rest of the app.

---

## 2. Desktop App Updates

### 2.1 Overview

The desktop app uses Electron with electron-builder for packaging. Updates are handled by `electron-updater`, the standard companion library to electron-builder. It checks GitHub Releases for new versions, downloads updates in the background, and applies them on restart.

This is the same mechanism used by Discord, VS Code, Slack, and other Electron apps.

### 2.2 Update Metadata

When electron-builder packages the app with a `publish` configuration pointing to GitHub, it generates metadata files alongside the binaries:

- `latest.yml` (Windows)
- `latest-mac.yml` (macOS)
- `latest-linux.yml` (Linux)

These YAML files contain the current version, download URLs, file sizes, and SHA512 checksums. They are uploaded to the GitHub Release alongside the binary artifacts.

`electron-updater` fetches the appropriate YAML file for the current platform to determine whether an update is available.

### 2.3 Windows (NSIS Installer)

**What electron-builder produces:**

- `Adieuu-x.y.z-win-x64.exe` -- the NSIS installer
- `Adieuu-x.y.z-win-x64.exe.blockmap` -- a content-defined chunking map of the installer binary
- `latest.yml` -- version metadata

**Update process:**

1. `electron-updater` fetches `latest.yml` from the GitHub Release.
2. Compares the version against the running app version.
3. If newer, fetches the **new blockmap** and diffs it against the **old blockmap** (cached locally from the previous install).
4. Downloads only the **changed blocks**. For a typical code-only change, this is roughly 5-15 MB instead of the full 80-100 MB installer.
5. Reconstructs the full new installer locally by combining unchanged blocks (from the existing install) with the downloaded deltas.
6. When the user triggers install (or on next app quit), runs the NSIS installer silently, which replaces the entire app directory (`C:\Users\<user>\AppData\Local\Programs\Adieuu\`).

**Result:** The full installation directory is replaced, but only the diff is downloaded. This is the "differential update" or "delta update" mechanism.

**Installer diagnostics (support):** A custom `build/installer.nsh` (see `apps/desktop/build/installer.nsh`) appends to `%LOCALAPPDATA%\Adieuu\logs\installer.log` at NSIS `preInit` (start of every run, including silent updates) and after the main `customInstall` step. End users can share that file with support if an install appears to hang. The in-app Updates page (Windows) includes a control to open that file with the default application (`open-windows-installer-log` → `shell.openPath` in the main process) plus the path in copy.

**Process cleanup (NSIS):** The same `installer.nsh` defines `customCheckAppRunning` to run electron-builder’s `_CHECK_APP_RUNNING`, then a final `taskkill /F /T /IM` sweep for `${APP_EXECUTABLE_FILENAME}` (per-user filter matches app-builder’s stock `KILL_PROCESS`). That helps clear Electron’s multi-process tree and stray PIDs before file replace. Note: several `Adieuu.exe` rows can be **normal** while one app session is running; the concern is leftovers after quit or during upgrade.

**In-app electron-updater log (all desktop OSes, including Linux):** The main process appends timestamped lines to `userData/logs/update.log` (e.g. `~/.config/<app>/logs/update.log` on typical Linux) for `checking-for-update`, `update-*` results, throttled `download-progress`, `update-downloaded`, `error`, and related IPC (download/install/check/clear cache). The About → Updates page exposes `get-in-app-update-log-path` (for display) and `open-in-app-update-log` (creates the file with a short header if missing, then `shell.openPath`). This is the primary support log for in-app update behaviour on Linux, macOS, and Windows; Windows still has the separate NSIS `installer.log` above for the NSIS process itself.

### 2.4 macOS (zip)

**What electron-builder produces:**

- `Adieuu-x.y.z-mac-x64.zip` -- the zipped `.app` bundle
- `Adieuu-x.y.z-mac-x64.zip.blockmap` -- blockmap for differential downloads
- `latest-mac.yml` -- version metadata

**Update process:**

Identical to Windows: blockmap-based differential download, then the full `.app` bundle in `/Applications/` is replaced with the new one.

**Note:** The DMG target (also in the build config) is for first-time manual installation. `electron-updater` uses the **zip** target for auto-updates. Both are produced by the build.

### 2.5 Linux

`electron-updater` supports auto-update for all three Linux targets: AppImage, deb, and rpm. The mechanism differs per format.

#### 2.5.1 AppImage

**What electron-builder produces:**

- `Adieuu-x.y.z-linux-x86_64.AppImage` -- self-contained application image
- `latest-linux.yml` -- version metadata

**Update process:**

1. `electron-updater` fetches `latest-linux.yml`.
2. If newer, downloads the **full new AppImage**. There is no blockmap/differential support for AppImage.
3. Replaces the old AppImage file on disk.
4. Relaunches from the new file.

AppImages are typically 60-100 MB, so this is a full download. No privilege escalation is required -- the user owns the file.

#### 2.5.2 deb (Debian/Ubuntu)

**Update process:**

1. `electron-updater` fetches `latest-linux.yml` and downloads the new `.deb` file.
2. Uses privilege escalation (`pkexec` or similar) to install via `apt install`, `dpkg -i`, or equivalent.
3. The user is prompted for their password via a GUI sudo dialog.
4. The app restarts on the new version.

#### 2.5.3 rpm (Fedora/RHEL/openSUSE)

**Update process:**

1. `electron-updater` fetches `latest-linux.yml` and downloads the new `.rpm` file.
2. Detects the available package manager in priority order: `zypper`, `dnf`, `yum`, `rpm`.
3. Uses privilege escalation (`pkexec`, `kdesudo`, or similar) to run the install command.
4. The user is prompted for their password via a GUI sudo dialog.
5. The app restarts on the new version.

**Known issue (fixed in electron-updater 6.6.5):** Versions prior to 6.6.5 would crash if `zypper` was not installed (e.g. on Fedora, which uses `dnf`), because the package manager detection threw an exception instead of falling back. See [electron-builder#9099](https://github.com/electron-userland/electron-builder/issues/9099).

**Known issue (pkexec + KDE Plasma 6):** `electron-updater`'s `LinuxUpdater` unconditionally passes `--disable-internal-agent` to `pkexec`. This flag tells `pkexec` to rely entirely on an external polkit authentication agent (e.g. `polkit-kde-authentication-agent-1`). If no agent is reachable -- which can happen intermittently on KDE Plasma 6 due to agent lifecycle timing -- `pkexec` exits with code 127. This causes the update install step to fail even after the RPM has been downloaded successfully.

**Mitigation:** We ship a Polkit policy file (`com.adieuu.desktop.update.policy`) in the RPM and deb packages. The `after-install.sh` script copies it to `/usr/share/polkit-1/actions/` at install time. This policy explicitly authorises the `dnf` executable for Adieuu updates with `auth_admin` (password prompt) and `allow_gui=true`, ensuring a consistent authentication dialog regardless of agent state.

**Upstream:** This should be reported to [electron-builder](https://github.com/electron-userland/electron-builder) -- the `--disable-internal-agent` flag ought to be conditional on detecting a running external agent, rather than unconditional.

### 2.6 Platform Summary

| Platform | Download size | What's replaced | Differential? |
|----------|---------------|-----------------|---------------|
| Windows (NSIS) | Changed blocks only (~5-15 MB typical) | Entire app directory via silent NSIS reinstall | Yes (blockmap) |
| macOS (zip) | Changed blocks only | Entire `.app` bundle | Yes (blockmap) |
| Linux (AppImage) | Full AppImage (~60-100 MB) | Single AppImage file | No |
| Linux (deb) | Full .deb package | System package via apt/dpkg | No |
| Linux (rpm) | Full .rpm package | System package via dnf/zypper/yum | No |

### 2.7 User Experience Flow

1. App launches and checks the update feed in the background.
2. If a new version exists, a non-intrusive **UpdateBanner** appears with the version number and a "Download" button (or downloads silently when auto-download is enabled).
3. During download, the banner shows a **ProgressBar** with percentage and transferred/total byte counts (e.g. "Downloading update... 67% -- 43 MB / 64 MB").
4. When the download completes, the banner shows "Update ready -- restart to apply. [Restart Now] [Later]".
5. "Restart Now" triggers an **UpdateOverlay** -- a full-screen blocking overlay with the Adieuu logo, a spinner, and "Installing..." text. This is rendered before the IPC call so the user sees feedback while the main process blocks on the synchronous install.
6. The overlay is **dismissable** -- the user can minimize it back to the banner if they wish to continue using the app during install.
7. If the install fails, the banner shows the error message with a "Retry" button.
8. "Later" dismisses the banner. The update is applied automatically the next time the user quits the app (`autoInstallOnAppQuit: true`).

There is no partial or live-patching of the running process. An app restart is always required to apply the update.

All update state is shared via a single **UpdateProvider** context to avoid duplicate IPC listeners across components (banner, overlay, account overview).

### 2.8 IPC Architecture

The update lifecycle is managed entirely in Electron's **main process**. The renderer (UI) is notified via IPC:

- **Main to renderer:**
  - `update-available` -- fired when a new version is detected (includes version info)
  - `download-progress` -- fired during download (includes progress percentage)
  - `update-downloaded` -- fired when the update is ready to install

- **Renderer to main:**
  - `install-update` -- triggers `autoUpdater.quitAndInstall()`

These IPC channels are already scaffolded in the preload script's allowed channel lists.

### 2.9 Security Considerations

- `electron-updater` verifies the SHA512 checksum of downloaded files against the value in the `latest*.yml` metadata.
- All downloads happen over HTTPS from GitHub Releases.
- Code signing (macOS notarization, Windows Authenticode) is a separate concern and can be added independently. It improves user trust and OS gatekeeper behaviour but is not required for the update mechanism to function.
- The `will-navigate` security restriction in the main process is unaffected -- updates are handled entirely in the main process, not through web navigation.

---

## 3. What Is NOT Patched

On both platforms, updates are **full replacements**, not surgical patches of individual files:

- **Web:** The browser fetches entirely new HTML/JS/CSS assets. Old cached files are simply ignored (different hashes).
- **Desktop:** The entire app bundle/directory is replaced by a new installer run or AppImage swap. Individual `.js` or `.html` files inside the Electron app are not patched in place.

The "inline" aspect refers to the *user experience* -- the app itself tells you an update is available and handles it, rather than requiring the user to manually visit a download page. The underlying mechanism is full-version replacement with (on Windows/macOS) differential *downloads* to minimise bandwidth.
