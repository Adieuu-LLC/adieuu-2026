import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initI18n } from '@adieuu/ui/i18n';
import { App, PlatformProvider, AuthProvider, IdentityProvider, ThemeProvider, IconPackProvider, ToastProvider, CrashBoundary, type AppConfig } from '@adieuu/ui';
import { crashReporter } from '@adieuu/ui/services/crashReporter';
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

// FriendlyCaptcha sitekey (free-tier captcha; optional)
const friendlyCaptchaSitekey = import.meta.env.VITE_FRIENDLY_CAPTCHA_SITEKEY || undefined;

// Web platform configuration
const config: AppConfig = {
  apiBaseUrl,
  chatWsUrl,
  externalLinkBase: '', // Relative links
  platform: 'web',
  livekitUrl,
  friendlyCaptchaSitekey,
};

crashReporter.init({ endpoint: apiBaseUrl, platform: 'web' });

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <CrashBoundary reportEndpoint={apiBaseUrl}>
        <PlatformProvider config={config} capabilities={webCapabilities}>
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
    </BrowserRouter>
  </StrictMode>
);
