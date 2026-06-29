/**
 * Pop-culture text patterns shared between profile fields (server) and
 * encrypted messages (client claim).
 *
 * Security: all patterns are static literals; user text is never interpolated
 * into RegExp. Scanning is bounded via {@link ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH}.
 */

import {
  ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH,
  textForAchievementScan,
} from './safe-achievement-text-scan';

export const TEXT_BEDAZZLER_EMOJI_THRESHOLD = 10;

export const POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS = {
  sk8r: 'text_sk8r',
  reginaGeorge: 'text_regina_george',
  zoltan: 'text_zoltan',
  jamesBond: 'text_james_bond',
  muggle: 'text_muggle',
  pokemon: 'text_pokemon',
  bearsBeets: 'text_bears_beets',
  wakeMeUpInside: 'text_wake_me_up_inside',
  emojiBedazzler: 'text_emoji_bedazzler',
  iAmYourFather: 'text_i_am_your_father',
} as const;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function isExact(text: string, expected: string): boolean {
  return normalize(text) === expected.toLowerCase();
}

export function countEmojis(text: string): number {
  return text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
}

export function containsSk8r(text: string): boolean {
  return /\bsk8r\b/i.test(text);
}

export function isReginaGeorge(text: string): boolean {
  return isExact(text, 'regina george');
}

export function isZoltan(text: string): boolean {
  return isExact(text, 'zoltan');
}

export function isJamesBond(text: string): boolean {
  const normalized = normalize(text);
  return normalized === '007' || normalized === 'james bond';
}

export function containsMuggle(text: string): boolean {
  return /\bmuggle\b/i.test(text);
}

export function containsBeTheVeryBest(text: string): boolean {
  return /be the very best/i.test(text);
}

export function containsBearsAndBeets(text: string): boolean {
  return /\bbears\b/i.test(text) && /\bbeets\b/i.test(text);
}

export function containsWakeMeUpInside(text: string): boolean {
  return /wake me up inside/i.test(text);
}

export function usesManyEmojis(text: string): boolean {
  return countEmojis(text) > TEXT_BEDAZZLER_EMOJI_THRESHOLD;
}

export function containsIAmYourFather(text: string): boolean {
  return /i am your father/i.test(text);
}

/** Returns achievement action ids that apply to the given text. */
export function getPopCultureTextAchievementActions(text: string): string[] {
  const bounded = textForAchievementScan(text, ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH);
  if (bounded === null) return [];

  const actions: string[] = [];

  if (containsSk8r(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.sk8r);
  if (isReginaGeorge(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.reginaGeorge);
  if (isZoltan(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.zoltan);
  if (isJamesBond(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.jamesBond);
  if (containsMuggle(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.muggle);
  if (containsBeTheVeryBest(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.pokemon);
  if (containsBearsAndBeets(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.bearsBeets);
  if (containsWakeMeUpInside(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.wakeMeUpInside);
  if (usesManyEmojis(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.emojiBedazzler);
  if (containsIAmYourFather(bounded)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.iAmYourFather);

  return actions;
}
