/**
 * Lightweight client-side profanity detection for achievement triggers.
 *
 * This is NOT a moderation filter — it only needs to be "good enough" to
 * detect obvious curse words so the corresponding achievements can fire.
 */

const PROFANITY_SET = new Set([
  'ass',
  'asshole',
  'bastard',
  'bitch',
  'bollocks',
  'bullshit',
  'cock',
  'crap',
  'cunt',
  'damn',
  'dick',
  'douchebag',
  'fag',
  'fuck',
  'goddamn',
  'hell',
  'horseshit',
  'jackass',
  'motherfucker',
  'nigga',
  'nigger',
  'piss',
  'prick',
  'pussy',
  'shit',
  'slut',
  'twat',
  'whore',
  'wanker',
]);

const WORD_RE = /[a-zA-Z]+/g;

export function containsProfanity(text: string): boolean {
  for (const match of text.matchAll(WORD_RE)) {
    if (PROFANITY_SET.has(match[0].toLowerCase())) return true;
  }
  return false;
}
