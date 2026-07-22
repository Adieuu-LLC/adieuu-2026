/**
 * Ensures conversation calls and Space voice channels are mutually exclusive.
 */

type LeaveFn = () => Promise<void>;

let leaveConversationCall: LeaveFn | null = null;
let leaveVoiceChannel: LeaveFn | null = null;

export function registerConversationCallLeave(fn: LeaveFn | null): void {
  leaveConversationCall = fn;
}

export function registerVoiceChannelLeave(fn: LeaveFn | null): void {
  leaveVoiceChannel = fn;
}

/** Leave the other media session before starting `kind`. */
export async function clearOtherMediaSession(kind: 'conversation' | 'voice'): Promise<void> {
  if (kind === 'conversation') {
    await leaveVoiceChannel?.();
  } else {
    await leaveConversationCall?.();
  }
}
