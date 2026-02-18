import { useMemo } from 'react';
import type { Platform } from '@adieuu/shared';

/**
 * Detects the current platform (web, desktop, or mobile)
 */
export function usePlatform(): Platform {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return 'web';
    }

    // Electron detection
    if ('electron' in window || navigator.userAgent.includes('Electron')) {
      return 'desktop';
    }

    // Capacitor detection
    if ('Capacitor' in window) {
      const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (capacitor?.isNativePlatform?.()) {
        return 'mobile';
      }
    }

    return 'web';
  }, []);
}
