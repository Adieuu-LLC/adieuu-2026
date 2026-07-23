import { useState, useEffect } from 'react';

export function useExpiryCountdown(expiresAt?: string): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }
    const ts = new Date(expiresAt).getTime();
    if (!Number.isFinite(ts)) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const ms = ts - Date.now();
      if (ms <= 0) { setRemaining('Expired'); return; }
      const totalSec = Math.ceil(ms / 1000);
      if (totalSec < 60) setRemaining(`${totalSec}s`);
      else if (totalSec < 3600) setRemaining(`${Math.ceil(totalSec / 60)}m`);
      else if (totalSec < 86400) setRemaining(`${Math.ceil(totalSec / 3600)}h`);
      else setRemaining(`${Math.ceil(totalSec / 86400)}d`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return remaining;
}
