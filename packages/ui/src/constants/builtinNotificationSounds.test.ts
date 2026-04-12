import { describe, it, expect } from 'bun:test';
import {
  BUILTIN_NOTIFICATION_SOUND_ID_SET,
  DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
  getBuiltinNotificationSoundSrc,
  getBuiltinPostNormGain,
  isBuiltinNotificationSoundId,
} from './builtinNotificationSounds';

describe('builtinNotificationSounds', () => {
  it('maps known ids to /sounds/ URLs', () => {
    expect(getBuiltinNotificationSoundSrc('adieuu_arrival')).toBe('/sounds/adieuu_arrival.mp3');
    expect(getBuiltinNotificationSoundSrc('adieuu_click')).toBe('/sounds/adieuu_click.mp3');
  });

  it('applies post-normalization gain only where configured', () => {
    expect(getBuiltinPostNormGain('adieuu_arrival')).toBe(1.75);
    expect(getBuiltinPostNormGain('adieuu_click')).toBe(1);
    expect(getBuiltinPostNormGain('chime')).toBe(1);
  });

  it('recognizes built-in stems', () => {
    expect(isBuiltinNotificationSoundId('adieuu_mention')).toBe(true);
    expect(isBuiltinNotificationSoundId('not_a_real_sound')).toBe(false);
  });

  it('includes default DM and achievement ids in the built-in set', () => {
    expect(BUILTIN_NOTIFICATION_SOUND_ID_SET.has(DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID)).toBe(true);
    expect(BUILTIN_NOTIFICATION_SOUND_ID_SET.has(DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID)).toBe(
      true
    );
  });
});
