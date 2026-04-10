import type { BuiltinNotificationSoundId } from './builtinNotificationSounds';

export type NotificationSoundId = BuiltinNotificationSoundId | 'none' | 'custom';

/** Gain multiplier 0 (silent) through 2 (200% / +6 dB nominal). Exported for UI + playback clamp. */
export const MAX_NOTIFICATION_GAIN = 2;
