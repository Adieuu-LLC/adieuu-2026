import { describe, it, expect } from 'bun:test';
import { isAllowedAudioPath } from './audio-path';

describe('isAllowedAudioPath', () => {
  it('allows known audio extensions', () => {
    expect(isAllowedAudioPath('/music/song.mp3')).toBe(true);
    expect(isAllowedAudioPath('/a.WAV')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isAllowedAudioPath('/x.exe')).toBe(false);
    expect(isAllowedAudioPath('/noext')).toBe(false);
  });
});
