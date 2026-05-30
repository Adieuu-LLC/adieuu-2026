import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initI18n } from '@adieuu/ui/i18n';
import { App, PlatformProvider, AuthProvider, IdentityProvider, ThemeProvider, IconPackProvider, ToastProvider, type AppConfig } from '@adieuu/ui';
import '@adieuu/ui/icons/registry';
import { webCapabilities } from './platform';
import '@adieuu/ui/styles.scss';
import './index.scss';

// Initialize i18n before rendering
initI18n();

if (import.meta.env.DEV) {
  document.title = 'Adieuu Dev';
}

// Determine API URL - empty string for same-origin (dev), full URL for production
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

// Determine WebSocket URL - use env var if set, otherwise derive from current location
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const chatWsUrl = import.meta.env.VITE_CHAT_WS_URL ?? `${wsProtocol}//${window.location.host}/ws/chat`;

// LiveKit server URL for call service (optional)
const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || undefined;

// Web platform configuration
const config: AppConfig = {
  apiBaseUrl,
  chatWsUrl,
  externalLinkBase: '', // Relative links
  platform: 'web',
  livekitUrl,
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <PlatformProvider config={config} capabilities={webCapabilities}>
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
    </BrowserRouter>
  </StrictMode>
);
