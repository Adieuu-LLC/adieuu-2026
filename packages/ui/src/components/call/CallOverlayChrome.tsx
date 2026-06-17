import type { ReactNode } from 'react';

export interface CallOverlayChromeProps {
  children?: ReactNode;
}

export function CallOverlayChrome({ children }: CallOverlayChromeProps) {
  if (!children) return null;
  return <div className="call-overlay-chrome">{children}</div>;
}
