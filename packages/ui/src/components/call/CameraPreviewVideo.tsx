/**
 * Attaches a live camera MediaStream to a <video> element.
 * Shared by Audio & Video settings and the pre-join device modal.
 */

import { useEffect, useRef } from 'react';

export function CameraPreviewVideo({
  stream,
  className,
}: {
  stream: MediaStream;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;

    const tryPlay = () => {
      void el.play().catch(() => {});
    };

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    } else {
      el.addEventListener('loadeddata', tryPlay, { once: true });
    }

    return () => {
      el.removeEventListener('loadeddata', tryPlay);
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      controls={false}
      className={className}
    />
  );
}
