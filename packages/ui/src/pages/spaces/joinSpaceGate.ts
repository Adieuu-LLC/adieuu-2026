/** Client-only join gate for encrypted / cipher-required Spaces. */

export type CipherDetectStatus = 'idle' | 'checking' | 'matched' | 'missing' | 'unavailable';

/** Read-only browse is offered for non-E2EE, non-hidden Spaces. */
export function canBrowseSpace(space: { e2ee: boolean; visibility: string }): boolean {
  return !space.e2ee && space.visibility !== 'hidden';
}

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
