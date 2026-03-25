/**
 * Built-in notification sounds: human-readable labels and asset filenames under /sounds/.
 * Ids are the filename stem (stable for localStorage); add new rows when new files are added.
 */

const BUILTIN_PREFIX = '/sounds/';

/** Legacy preset ids from older builds; mapped to current stems on read. */
export const LEGACY_NOTIFICATION_SOUND_ID_MAP: Readonly<Record<string, string>> = {
  gentle: 'chime',
  bell: 'ding',
};

/**
 * Ordered for the settings dropdown. Default preset for new installs is `DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID`.
 * displayName is shown in the UI (English); extend i18n later if needed.
 */
export const BUILTIN_NOTIFICATION_SOUNDS = [
  { id: 'achievement', displayName: 'Achievement', filename: 'achievement.mp3' },
  { id: 'bike', displayName: 'Bike', filename: 'bike.mp3' },
  { id: 'blip', displayName: 'Blip', filename: 'blip.mp3' },
  { id: 'boing', displayName: 'Boing', filename: 'boing.mp3' },
  { id: 'chime', displayName: 'Gentle chime', filename: 'chime.mp3' },
  { id: 'coins', displayName: 'Coins', filename: 'coins.mp3' },
  { id: 'correct', displayName: 'Correct', filename: 'correct.mp3' },
  { id: 'ding', displayName: 'Ding', filename: 'ding.mp3' },
  { id: 'err', displayName: 'Err', filename: 'err.mp3' },
  { id: 'eyes', displayName: 'Eyes', filename: 'eyes.mp3' },
  { id: 'flush', displayName: 'Flush', filename: 'flush.mp3' },
  { id: 'goat', displayName: 'Goat', filename: 'goat.mp3' },
  { id: 'guitar', displayName: 'Guitar', filename: 'guitar.mp3' },
  { id: 'harp', displayName: 'Harp', filename: 'harp.mp3' },
  { id: 'hype', displayName: 'Hype', filename: 'hype.mp3' },
  { id: 'impact', displayName: 'Impact', filename: 'impact.mp3' },
  { id: 'jive', displayName: 'Jive', filename: 'jive.mp3' },
  { id: 'jump', displayName: 'Jump', filename: 'jump.mp3' },
  { id: 'jump-again', displayName: 'Jump Again', filename: 'jump-again.mp3' },
  { id: 'light', displayName: 'Light', filename: 'light.mp3' },
  { id: 'magic', displayName: 'Magic', filename: 'magic.mp3' },
  { id: 'meow', displayName: 'Meow', filename: 'meow.mp3' },
  { id: 'nice', displayName: 'Nice', filename: 'nice.mp3' },
  { id: 'phone-vibrate', displayName: 'Phone vibrate', filename: 'phone-vibrate.mp3' },
  { id: 'phone-vibrate-high', displayName: 'Phone vibrate (high)', filename: 'phone-vibrate-high.mp3' },
  { id: 'piano-a', displayName: 'Piano (A)', filename: 'piano-a.mp3' },
  { id: 'piano-e', displayName: 'Piano (E)', filename: 'piano-e.mp3' },
  { id: 'piano-f', displayName: 'Piano (F)', filename: 'piano-f.mp3' },
  { id: 'points', displayName: 'Points', filename: 'points.mp3' },
  { id: 'pong', displayName: 'Pong', filename: 'pong.mp3' },
  { id: 'pop', displayName: 'Pop', filename: 'pop.mp3' },
  { id: 'plink', displayName: 'Plink', filename: 'plink.mp3' },
  { id: 'propeller', displayName: 'Propeller', filename: 'propeller.mp3' },
  { id: 'punches', displayName: 'Punches', filename: 'punches.mp3' },
  { id: 'quack', displayName: 'Quack', filename: 'quack.mp3' },
  { id: 'rat', displayName: 'Rat', filename: 'rat.mp3' },
  { id: 'sax', displayName: 'Sax', filename: 'sax.mp3' },
  { id: 'slap', displayName: 'Slap', filename: 'slap.mp3' },
  { id: 'slice', displayName: 'Slice', filename: 'slice.mp3' },
  { id: 'strings', displayName: 'Strings', filename: 'strings.mp3' },
  { id: 'tada', displayName: 'Tada', filename: 'tada.mp3' },
  { id: 'thud', displayName: 'Thud', filename: 'thud.mp3' },
  { id: 'tick', displayName: 'Tick', filename: 'tick.mp3' },
  { id: 'tick-half', displayName: 'Tick (half)', filename: 'tick-half.mp3' },
  { id: 'tick-long', displayName: 'Tick (long)', filename: 'tick-long.mp3' },
  { id: 'vibe', displayName: 'Vibe', filename: 'vibe.mp3' },
  { id: 'whisper', displayName: 'Whisper', filename: 'whisper.mp3' },
  { id: 'whoosh', displayName: 'Whoosh', filename: 'whoosh.mp3' },
  { id: 'win-high', displayName: 'Win (high)', filename: 'win-high.mp3' },
  { id: 'win-low', displayName: 'Win (low)', filename: 'win-low.mp3' },
] as const;

export type BuiltinNotificationSoundId = (typeof BUILTIN_NOTIFICATION_SOUNDS)[number]['id'];

export const DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID: BuiltinNotificationSoundId = 'win-low';

const builtinIdToFilename = new Map<string, string>(
  BUILTIN_NOTIFICATION_SOUNDS.map((s) => [s.id, s.filename])
);

/** Set of valid built-in sound ids (filename stems). */
export const BUILTIN_NOTIFICATION_SOUND_ID_SET = new Set<string>(builtinIdToFilename.keys());

export function getBuiltinNotificationSoundSrc(
  id: BuiltinNotificationSoundId
): string {
  const filename = builtinIdToFilename.get(id);
  if (!filename) {
    throw new Error(`Unknown built-in notification sound id: ${id}`);
  }
  return `${BUILTIN_PREFIX}${filename}`;
}

export function isBuiltinNotificationSoundId(id: string): id is BuiltinNotificationSoundId {
  return BUILTIN_NOTIFICATION_SOUND_ID_SET.has(id);
}
