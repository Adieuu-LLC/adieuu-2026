import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initI18n } from '@adieuu/ui/i18n';
import { App, PlatformProvider, AuthProvider, IdentityProvider, ToastProvider, type AppConfig } from '@adieuu/ui';
import { webCapabilities } from './platform';
import '@adieuu/ui/styles.scss';
import './index.css';

// Initialize i18n before rendering
initI18n();

// Determine WebSocket URL based on current location
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const chatWsUrl = import.meta.env.VITE_CHAT_WS_URL ??
  (import.meta.env.DEV ? 'ws://localhost:9001/ws/chat' : `${wsProtocol}//${window.location.host}/ws/chat`);

// Web platform configuration
const config: AppConfig = {
  apiBaseUrl: '', // Same-origin, no base URL needed
  chatWsUrl,
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
          <IdentityProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </IdentityProvider>
        </AuthProvider>
      </PlatformProvider>
    </BrowserRouter>
  </StrictMode>
);
