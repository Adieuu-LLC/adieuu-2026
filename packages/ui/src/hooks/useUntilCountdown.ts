import { useState, useEffect } from 'react';

interface CountdownResult {
  /** Human-readable label like "2d 5h 30m 12s" or "05:30:12". */
  label: string;
  /** True once the target time has passed. */
  isExpired: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s';

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Ticks every second, returning a formatted countdown label and expiry flag.
 * Accepts an ISO-8601 date string as the target time.
 */
export function useUntilCountdown(isoTarget?: string): CountdownResult {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!isoTarget) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isoTarget]);

  if (!isoTarget) {
    return { label: '', isExpired: true };
  }

  const remaining = new Date(isoTarget).getTime() - now;

  if (remaining <= 0) {
    return { label: '0s', isExpired: true };
  }

  return { label: formatRemaining(remaining), isExpired: false };
}
