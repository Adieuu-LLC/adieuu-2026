import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initI18n } from '@adieuu/ui/i18n';
import { App, PlatformProvider, AuthProvider, IdentityProvider, ThemeProvider, IconPackProvider, ToastProvider, CrashBoundary, type AppConfig, setDeviceKeyStorageBackend, setPreKeyStorageBackend, migrateIndexedDbToBackend } from '@adieuu/ui';
import { crashReporter } from '@adieuu/ui/services/crashReporter';
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
  externalLinkBase: __APP_ORIGIN__,
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
      <CrashBoundary reportEndpoint={API_BASE_URL}>
        <PlatformProvider config={config} capabilities={desktopCapabilities}>
          <ToastProvider>
            <AuthProvider>
              <IdentityProvider>
                <ThemeProvider>
                  <IconPackProvider>
                    <App />
                  </IconPackProvider>
                </ThemeProvider>
              </IdentityProvider>
            </AuthProvider>
          </ToastProvider>
        </PlatformProvider>
      </CrashBoundary>
    </>
  );
}

crashReporter.init({ endpoint: API_BASE_URL, platform: 'desktop' });

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
