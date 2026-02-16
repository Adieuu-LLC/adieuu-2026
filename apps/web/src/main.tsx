import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initI18n } from '@chadder/ui/i18n';
import { App, PlatformProvider, AuthProvider, ToastProvider, type AppConfig } from '@chadder/ui';
import { webCapabilities } from './platform';
import '@chadder/ui/styles.css';
import './index.css';

// Initialize i18n before rendering
initI18n();

// Web platform configuration
const config: AppConfig = {
  apiBaseUrl: '', // Same-origin, no base URL needed
  externalLinkBase: '', // Relative links
  platform: 'web',
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <PlatformProvider config={config} capabilities={webCapabilities}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </PlatformProvider>
    </BrowserRouter>
  </StrictMode>
);
