import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { usePlatformContext } from '../config/PlatformContext';

type FullscreenMode = 'none' | 'electron' | 'element' | 'css';

export function useCallFullscreen(overlayRef: RefObject<HTMLElement | null>) {
  const { capabilities } = usePlatformContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const modeRef = useRef<FullscreenMode>('none');

  const exit = useCallback(async () => {
    const mode = modeRef.current;
    try {
      if (mode === 'electron' && capabilities.appWindow?.setFullScreen) {
        await capabilities.appWindow.setFullScreen(false);
      } else if (mode === 'element' && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fall through to local state reset.
    }
    modeRef.current = 'none';
    setIsExpanded(false);
  }, [capabilities.appWindow]);

  const enter = useCallback(async () => {
    const element = overlayRef.current;
    if (!element) return;

    if (capabilities.appWindow?.setFullScreen) {
      try {
        await capabilities.appWindow.setFullScreen(true);
        modeRef.current = 'electron';
        setIsExpanded(true);
        return;
      } catch {
        // Try browser/CSS fallbacks.
      }
    }

    if (typeof element.requestFullscreen === 'function') {
      try {
        await element.requestFullscreen();
        modeRef.current = 'element';
        setIsExpanded(true);
        return;
      } catch {
        // Fall through to CSS expanded mode.
      }
    }

    modeRef.current = 'css';
    setIsExpanded(true);
  }, [capabilities.appWindow, overlayRef]);

  const toggle = useCallback(async () => {
    if (isExpanded) {
      await exit();
    } else {
      await enter();
    }
  }, [enter, exit, isExpanded]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && modeRef.current === 'element') {
        modeRef.current = 'none';
        setIsExpanded(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (modeRef.current !== 'none') {
        void exit();
      }
    };
  }, [exit]);

  return { isExpanded, toggle, enter, exit };
}
