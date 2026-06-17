/**
 * Pop-culture text patterns shared between profile fields (server) and
 * encrypted messages (client claim).
 */

export const TEXT_BEDAZZLER_EMOJI_THRESHOLD = 10;

export const POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS = {
  sk8r: 'text_sk8r',
  reginaGeorge: 'text_regina_george',
  chuckNorris: 'text_chuck_norris',
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

export function isChuckNorris(text: string): boolean {
  return isExact(text, 'chuck norris');
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
  const actions: string[] = [];

  if (containsSk8r(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.sk8r);
  if (isReginaGeorge(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.reginaGeorge);
  if (isChuckNorris(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.chuckNorris);
  if (isZoltan(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.zoltan);
  if (isJamesBond(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.jamesBond);
  if (containsMuggle(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.muggle);
  if (containsBeTheVeryBest(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.pokemon);
  if (containsBearsAndBeets(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.bearsBeets);
  if (containsWakeMeUpInside(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.wakeMeUpInside);
  if (usesManyEmojis(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.emojiBedazzler);
  if (containsIAmYourFather(text)) actions.push(POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.iAmYourFather);

  return actions;
}
