import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initI18n } from '@chadder/ui/i18n';
import { App } from './App';
import { AuthProvider } from './hooks/useAuth';
import '@chadder/ui/styles.css';
import './index.css';

// Initialize i18n before rendering
initI18n();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// Use HashRouter for Electron (file:// protocol doesn't support BrowserRouter)
createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);
