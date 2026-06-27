import { useState, useEffect, useCallback } from 'react';

/**
 * Custom window title bar for Windows/Linux.
 * macOS uses native traffic lights via titleBarStyle: 'hiddenInset'
 */
export function WindowTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  // Only show on non-macOS platforms
  const isMac = window.electron?.platform === 'darwin';

  const updateMaximizedState = useCallback(async () => {
    if (window.electron?.window) {
      const maximized = await window.electron.window.isMaximized();
      setIsMaximized(maximized);
    }
  }, []);

  useEffect(() => {
    updateMaximizedState();

    // Update state when window is resized (could be maximize/restore)
    const handleResize = () => {
      updateMaximizedState();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateMaximizedState]);

  const handleMinimize = () => {
    window.electron?.window.minimize();
  };

  const handleMaximize = async () => {
    await window.electron?.window.maximize();
    updateMaximizedState();
  };

  const handleClose = () => {
    window.electron?.window.close();
  };

  // Don't render on macOS - uses native controls
  if (isMac) {
    return null;
  }

  return (
    <div className="window-title-bar">
      <div className="window-drag-region" />
      <div className="window-controls">
        <button
          className="window-control-btn window-control-minimize"
          onClick={handleMinimize}
          aria-label="Minimize"
          type="button"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect fill="currentColor" width="10" height="1" />
          </svg>
        </button>
        <button
          className="window-control-btn window-control-maximize"
          onClick={handleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          type="button"
        >
          {isMaximized ? (
            // Restore icon (two overlapping rectangles)
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                d="M2.5 0.5h7v7h-7v-7M0.5 2.5h7v7h-7v-7"
              />
            </svg>
          ) : (
            // Maximize icon (single rectangle)
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                x="0.5"
                y="0.5"
                width="9"
                height="9"
              />
            </svg>
          )}
        </button>
        <button
          className="window-control-btn window-control-close"
          onClick={handleClose}
          aria-label="Close"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              fill="currentColor"
              d="M1.41 0L5 3.59L8.59 0L10 1.41L6.41 5L10 8.59L8.59 10L5 6.41L1.41 10L0 8.59L3.59 5L0 1.41L1.41 0z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
