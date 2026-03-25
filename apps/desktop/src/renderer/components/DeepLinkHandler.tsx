import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Listens for deep link events from the main process and navigates
 * the SPA to the requested route.
 *
 * Handles two cases:
 * - Cold start: fetches any pending deep link URL that launched the app.
 * - Warm start: listens for deep-link IPC events from second-instance
 *   or open-url handlers in the main process.
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    window.electron
      .invoke('get-pending-deep-link')
      .then((routePath) => {
        if (typeof routePath === 'string' && routePath !== '/') {
          navigate(routePath);
        }
      })
      .catch(() => {});

    window.electron.on('deep-link', (routePath) => {
      if (typeof routePath === 'string') {
        navigate(routePath);
      }
    });
  }, [navigate]);

  return null;
}
