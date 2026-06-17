import { useEffect, useState, type RefObject } from 'react';

/**
 * Observes an underlying HTMLVideoElement inside `containerRef` and reports
 * whether the stream is portrait (height > width).
 */
export function useTrackAspectRatio(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsPortrait(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const video = container.querySelector('video');
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        setIsPortrait(video.videoHeight > video.videoWidth);
      }
    };

    update();

    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });

    const video = container.querySelector('video');
    video?.addEventListener('loadedmetadata', update);
    video?.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      video?.removeEventListener('loadedmetadata', update);
      video?.removeEventListener('resize', update);
    };
  }, [containerRef, enabled]);

  return isPortrait;
}
