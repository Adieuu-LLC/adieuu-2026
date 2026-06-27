import { describe, expect, test } from 'bun:test';
import {
  containsSlimShadyDisplayName,
  isEdgeLordDisplayName,
  isMcLovinDisplayName,
  isNeoOrTrinityDisplayName,
  isSingleSymbolDisplayName,
} from './display-name-achievement.service';

describe('display name achievement patterns', () => {
  test('edge lord requires xX prefix and Xx suffix', () => {
    expect(isEdgeLordDisplayName('xXShadowXx')).toBe(true);
    expect(isEdgeLordDisplayName('xX only')).toBe(false);
    expect(isEdgeLordDisplayName('endsXx')).toBe(false);
  });

  test('mclovin is an exact match', () => {
    expect(isMcLovinDisplayName('McLovin')).toBe(true);
    expect(isMcLovinDisplayName('McLovin!')).toBe(false);
  });

  test('slim shady can appear anywhere in the name', () => {
    expect(containsSlimShadyDisplayName('The Real Slim Shady')).toBe(true);
    expect(containsSlimShadyDisplayName('Slim')).toBe(false);
  });

  test('single symbol names are one non-alphanumeric character', () => {
    expect(isSingleSymbolDisplayName('!')).toBe(true);
    expect(isSingleSymbolDisplayName('??')).toBe(false);
    expect(isSingleSymbolDisplayName('A')).toBe(false);
  });

  test('neo and trinity are exact matches', () => {
    expect(isNeoOrTrinityDisplayName('Neo')).toBe(true);
    expect(isNeoOrTrinityDisplayName('trinity')).toBe(true);
    expect(isNeoOrTrinityDisplayName('Neo Anderson')).toBe(false);
  });
});
