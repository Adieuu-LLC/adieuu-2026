import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initI18n } from '@adieuu/ui/i18n';
import { App, PlatformProvider, AuthProvider, IdentityProvider, ThemeProvider, IconPackProvider, ToastProvider, type AppConfig, setDeviceKeyStorageBackend, setPreKeyStorageBackend, migrateIndexedDbToBackend } from '@adieuu/ui';
import '@adieuu/ui/icons/registry';
import { desktopCapabilities } from './platform';
import { API_BASE_URL, CHAT_WS_URL, LIVEKIT_URL } from './config';
import { WindowTitleBar } from './components/WindowTitleBar';
import { DeepLinkHandler } from './components/DeepLinkHandler';
import '@adieuu/ui/styles.scss';
import './index.scss';

// Initialize i18n before rendering
initI18n();

if (import.meta.env.DEV) {
  document.title = 'Adieuu Dev';
}

// Use TEE-backed secure storage for device keys instead of IndexedDB.
// Must be called before any identity/login operations.
setDeviceKeyStorageBackend(desktopCapabilities.secureStorage);
setPreKeyStorageBackend(desktopCapabilities.secureStorage);
migrateIndexedDbToBackend().then((count: number) => {
  if (count > 0) {
    console.info(`[Desktop] Migrated ${count} device key record(s) from IndexedDB to secure storage`);
  }
}).catch((err: unknown) => {
  console.error('[Desktop] Device key migration failed:', err);
});

// Desktop platform configuration
const config: AppConfig = {
  apiBaseUrl: API_BASE_URL,
  chatWsUrl: CHAT_WS_URL,
  externalLinkBase: 'https://adieuu.com', // External links open in browser
  platform: 'desktop',
  livekitUrl: LIVEKIT_URL,
};

/**
 * Desktop app wrapper that includes the custom title bar for Windows/Linux.
 */
function DesktopApp() {
  const isMac = window.electron?.platform === 'darwin';

  // Add class to body for CSS targeting when custom title bar is shown
  useEffect(() => {
    if (!isMac) {
      document.body.classList.add('has-custom-title-bar');
    }
    return () => {
      document.body.classList.remove('has-custom-title-bar');
    };
  }, [isMac]);

  return (
    <>
      <WindowTitleBar />
      <DeepLinkHandler />
      <PlatformProvider config={config} capabilities={desktopCapabilities}>
        <AuthProvider>
          <IdentityProvider>
            <ThemeProvider>
              <IconPackProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </IconPackProvider>
            </ThemeProvider>
          </IdentityProvider>
        </AuthProvider>
      </PlatformProvider>
    </>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// HashRouter works cleanly with the adieuu:// custom protocol scheme
createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <DesktopApp />
    </HashRouter>
  </StrictMode>
);
