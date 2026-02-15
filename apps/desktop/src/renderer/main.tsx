import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initI18n } from '@chadder/ui/i18n';
import { App, PlatformProvider, AuthProvider, type AppConfig } from '@chadder/ui';
import { desktopCapabilities } from './platform';
import { API_BASE_URL } from './config';
import '@chadder/ui/styles.css';
import './index.css';

// Initialize i18n before rendering
initI18n();

// Desktop platform configuration
const config: AppConfig = {
  apiBaseUrl: API_BASE_URL,
  externalLinkBase: 'https://chadder.app', // External links open in browser
  platform: 'desktop',
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// Use HashRouter for Electron (file:// protocol doesn't support BrowserRouter)
createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <PlatformProvider config={config} capabilities={desktopCapabilities}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PlatformProvider>
    </HashRouter>
  </StrictMode>
);
