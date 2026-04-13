import type { App } from 'electron';
import { execSync } from 'child_process';

/**
 * Probes D-Bus for available secret-service backends when environment
 * variables like XDG_CURRENT_DESKTOP are unavailable.
 *
 * Tried in order: KWallet 6, KWallet 5, freedesktop Secret Service
 * (GNOME Keyring, etc.). Returns the first one that responds.
 */
export function probeDbusSecretBackend(): string | undefined {
  const probes: Array<{ store: string; dest: string; path: string }> = [
    { store: 'kwallet6', dest: 'org.kde.kwalletd6', path: '/modules/kwalletd6' },
    { store: 'kwallet5', dest: 'org.kde.kwalletd5', path: '/modules/kwalletd5' },
  ];

  for (const { store, dest, path: objPath } of probes) {
    try {
      execSync(
        `dbus-send --session --print-reply --dest=${dest} ${objPath} org.kde.KWallet.isEnabled`,
        { timeout: 2000, stdio: 'pipe' },
      );
      console.info(`[SafeStorage] D-Bus probe found ${store}`);
      return store;
    } catch {
      // Service not available, try next
    }
  }

  try {
    execSync(
      'dbus-send --session --print-reply --dest=org.freedesktop.secrets /org/freedesktop/secrets org.freedesktop.DBus.Peer.Ping',
      { timeout: 2000, stdio: 'pipe' },
    );
    console.info('[SafeStorage] D-Bus probe found freedesktop Secret Service');
    return 'gnome-libsecret';
  } catch {
    // No secret service found
  }

  console.warn('[SafeStorage] No secret service backend found via D-Bus');
  return undefined;
}

/**
 * Linux password store detection (must run before app.whenReady).
 */
export function applyLinuxPasswordStore(app: App): void {
  if (process.platform !== 'linux') return;

  const override = process.env.ADIEUU_PASSWORD_STORE;
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase();
  const kdeVersion = process.env.KDE_SESSION_VERSION ?? '';

  let store: string | undefined;

  if (override) {
    store = override;
  } else if (desktop.includes('kde')) {
    store = parseInt(kdeVersion || '5', 10) >= 6 ? 'kwallet6' : 'kwallet5';
  } else if (
    desktop.includes('gnome')
    || desktop.includes('unity')
    || desktop.includes('pantheon')
    || desktop.includes('cinnamon')
  ) {
    store = 'gnome-libsecret';
  }

  if (!store && !override) {
    store = probeDbusSecretBackend();
  }

  if (store) {
    console.info('[SafeStorage] Using --password-store=' + store);
    app.commandLine.appendSwitch('password-store', store);
  }
}
