/** Client-only join gate for encrypted / cipher-required Spaces. */

export type CipherDetectStatus = 'idle' | 'checking' | 'matched' | 'missing' | 'unavailable';

/** Pure join-gate used by the interstitial (not API-enforced). */
export function isJoinAllowed(opts: {
  hasCipherCheck: boolean;
  cipherRequired: boolean;
  detectStatus: CipherDetectStatus;
}): boolean {
  if (!opts.hasCipherCheck) return true;
  if (opts.detectStatus === 'matched') return true;
  if (
    !opts.cipherRequired &&
    (opts.detectStatus === 'missing' || opts.detectStatus === 'unavailable')
  ) {
    return true;
  }
  return false;
}
