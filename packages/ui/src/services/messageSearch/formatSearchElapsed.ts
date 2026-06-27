/**
 * Display elapsed time for the message search status banner (m:ss, up to 59:59).
 */
export function formatSearchElapsedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0:00';
  }
  const totalSec = Math.min(Math.floor(ms / 1000), 60 * 60 * 24 - 1);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
