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
        const electron = (window as { electron?: { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> } }).electron;
        if (electron?.invoke) {
          await electron.invoke('open-verification-window', url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      break;
    }

    case 'mobile': {
      try {
        const capacitorModule = '@capacitor/browser';
        const mod = (await import(/* @vite-ignore */ capacitorModule)) as {
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
