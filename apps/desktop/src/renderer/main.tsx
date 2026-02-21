import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initI18n } from '@adieuu/ui/i18n';
import { App, PlatformProvider, AuthProvider, IdentityProvider, ToastProvider, type AppConfig } from '@adieuu/ui';
import { desktopCapabilities } from './platform';
import { API_BASE_URL, CHAT_WS_URL } from './config';
import { WindowTitleBar } from './components/WindowTitleBar';
import '@adieuu/ui/styles.scss';
import './index.css';

// Initialize i18n before rendering
initI18n();

// Desktop platform configuration
const config: AppConfig = {
  apiBaseUrl: API_BASE_URL,
  chatWsUrl: CHAT_WS_URL,
  externalLinkBase: 'https://adieuu.app', // External links open in browser
  platform: 'desktop',
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
      <PlatformProvider config={config} capabilities={desktopCapabilities}>
        <AuthProvider>
          <IdentityProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </IdentityProvider>
        </AuthProvider>
      </PlatformProvider>
    </>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// Use HashRouter for Electron (file:// protocol doesn't support BrowserRouter)
createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <DesktopApp />
    </HashRouter>
  </StrictMode>
);
