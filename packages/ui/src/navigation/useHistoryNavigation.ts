import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

function getHistoryIndex(): number {
  const idx = window.history.state?.idx;
  return typeof idx === 'number' ? idx : 0;
}

/**
 * Exposes browser-style back/forward for React Router history (including HashRouter).
 */
export function useHistoryNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const maxIdxRef = useRef(getHistoryIndex());
  const [historyIndex, setHistoryIndex] = useState(getHistoryIndex);

  useEffect(() => {
    const idx = getHistoryIndex();
    if (navigationType === 'REPLACE') {
      maxIdxRef.current = idx;
    } else {
      maxIdxRef.current = Math.max(maxIdxRef.current, idx);
    }
    setHistoryIndex(idx);
  }, [location.key, navigationType]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < maxIdxRef.current;

  const goBack = useCallback(() => {
    if (canGoBack) navigate(-1);
  }, [canGoBack, navigate]);

  const goForward = useCallback(() => {
    if (canGoForward) navigate(1);
  }, [canGoForward, navigate]);

  return { canGoBack, canGoForward, goBack, goForward };
}
