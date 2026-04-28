/**
 * Cross-platform helper to open an external verification URL.
 *
 * - web: window.open in a new tab
 * - desktop: IPC to open a child BrowserWindow
 * - mobile: @capacitor/browser (native in-app browser)
 */

import type { Platform } from '@adieuu/shared';

interface CapacitorBrowser {
  open(options: { url: string }): Promise<void>;
}

export async function openVerificationUrl(url: string, platform: Platform): Promise<void> {
  switch (platform) {
    case 'desktop': {
      try {
        const electron = (window as { electron?: { send?: (channel: string, data: unknown) => void } }).electron;
        electron?.send?.('open-verification-window', url);
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      break;
    }

    case 'mobile': {
      try {
        // @capacitor/browser is only available in mobile builds
        const mod = (await import(/* webpackIgnore: true */ '@capacitor/browser' as string)) as {
          Browser: CapacitorBrowser;
        };
        await mod.Browser.open({ url });
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      break;
    }

    default:
      window.open(url, '_blank', 'noopener,noreferrer');
      break;
  }
}
