/**
 * Emoji Shortcode Conversion
 *
 * Converts common text shortcuts and colon-delimited shortcodes
 * into their Unicode emoji equivalents before sending.
 *
 * @module utils/emojiShortcodes
 */

const TEXT_SHORTCUTS: Record<string, string> = {
  ':)': '\u{1F642}',
  ':-)': '\u{1F642}',
  ':(': '\u{1F641}',
  ':-(': '\u{1F641}',
  ':D': '\u{1F603}',
  ':-D': '\u{1F603}',
  ';)': '\u{1F609}',
  ';-)': '\u{1F609}',
  ':P': '\u{1F61B}',
  ':-P': '\u{1F61B}',
  ':p': '\u{1F61B}',
  ':-p': '\u{1F61B}',
  'XD': '\u{1F606}',
  'xD': '\u{1F606}',
  ':O': '\u{1F62E}',
  ':-O': '\u{1F62E}',
  ':o': '\u{1F62E}',
  ":'(": '\u{1F622}',
  '<3': '\u{2764}\u{FE0F}',
  '</3': '\u{1F494}',
  ':*': '\u{1F618}',
  ':-*': '\u{1F618}',
  'B)': '\u{1F60E}',
  'B-)': '\u{1F60E}',
  ':/': '\u{1F615}',
  ':-/': '\u{1F615}',
  ':|': '\u{1F610}',
  ':-|': '\u{1F610}',
  '>:(': '\u{1F620}',
  '>:-(': '\u{1F620}',
};

const COLON_SHORTCODES: Record<string, string> = {
  'thumbsup': '\u{1F44D}',
  'thumbs_up': '\u{1F44D}',
  '+1': '\u{1F44D}',
  'thumbsdown': '\u{1F44E}',
  'thumbs_down': '\u{1F44E}',
  '-1': '\u{1F44E}',
  'heart': '\u{2764}\u{FE0F}',
  'fire': '\u{1F525}',
  'laugh': '\u{1F602}',
  'joy': '\u{1F602}',
  'cry': '\u{1F622}',
  'sob': '\u{1F62D}',
  'clap': '\u{1F44F}',
  'wave': '\u{1F44B}',
  'pray': '\u{1F64F}',
  'eyes': '\u{1F440}',
  'rocket': '\u{1F680}',
  'tada': '\u{1F389}',
  'party': '\u{1F389}',
  'check': '\u{2705}',
  'x': '\u{274C}',
  'star': '\u{2B50}',
  'sparkles': '\u{2728}',
  'skull': '\u{1F480}',
  'brain': '\u{1F9E0}',
  'ok': '\u{1F44C}',
  'ok_hand': '\u{1F44C}',
  'raised_hands': '\u{1F64C}',
  'muscle': '\u{1F4AA}',
  'sweat_smile': '\u{1F605}',
  'thinking': '\u{1F914}',
  'shrug': '\u{1F937}',
  'facepalm': '\u{1F926}',
  'sunglasses': '\u{1F60E}',
  'wink': '\u{1F609}',
  'grimace': '\u{1F62C}',
  'poop': '\u{1F4A9}',
  'ghost': '\u{1F47B}',
  'alien': '\u{1F47D}',
  'robot': '\u{1F916}',
  'angel': '\u{1F607}',
  'devil': '\u{1F608}',
  'crown': '\u{1F451}',
  'gem': '\u{1F48E}',
  'ring': '\u{1F48D}',
  'rose': '\u{1F339}',
  'rainbow': '\u{1F308}',
  'moon': '\u{1F319}',
  'sun': '\u{2600}\u{FE0F}',
  'coffee': '\u{2615}',
  'beer': '\u{1F37A}',
  'pizza': '\u{1F355}',
  'cake': '\u{1F370}',
  'cookie': '\u{1F36A}',
  'dog': '\u{1F436}',
  'cat': '\u{1F431}',
  'panda': '\u{1F43C}',
  'unicorn': '\u{1F984}',
  'penguin': '\u{1F427}',
  '100': '\u{1F4AF}',
  'lock': '\u{1F512}',
  'key': '\u{1F511}',
  'shield': '\u{1F6E1}\u{FE0F}',
  'warning': '\u{26A0}\u{FE0F}',
  'bulb': '\u{1F4A1}',
  'link': '\u{1F517}',
  'pin': '\u{1F4CC}',
  'megaphone': '\u{1F4E3}',
  'bell': '\u{1F514}',
  'wave_hand': '\u{1F44B}',
  'handshake': '\u{1F91D}',
  'crossed_fingers': '\u{1F91E}',
  'victory': '\u{270C}\u{FE0F}',
};

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const textShortcutPattern = new RegExp(
  Object.keys(TEXT_SHORTCUTS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|'),
  'g'
);

const EMOJI_TO_SHORTCODE: Record<string, string> = Object.fromEntries(
  Object.entries(COLON_SHORTCODES).map(([code, emoji]) => [emoji, code])
);

/**
 * Return the colon shortcode for a given emoji character, e.g. "👍" -> ":thumbsup:".
 * Falls back to the emoji itself when no mapping exists.
 */
export function getShortcode(emoji: string): string {
  const code = EMOJI_TO_SHORTCODE[emoji];
  return code ? `:${code}:` : emoji;
}

const colonShortcodePattern = /:([a-z0-9_+-]+):/gi;

/**
 * Matches http(s) URLs and bare www. domains so they can be shielded
 * from text-shortcut replacement (e.g. `://` must not become `😕/`).
 */
const URL_SHIELD_RE = /(?:https?:\/\/|www\.)[^\s<>'"]+/gi;

/**
 * Convert text shortcuts and :colon_shortcodes: to Unicode emoji.
 * Run this on the plaintext before encryption.
 *
 * URLs are shielded from text-shortcut replacement so that protocol
 * schemes like `://` are not mangled by shortcuts such as `:/`.
 */
export function convertShortcodes(text: string): string {
  let result = text.replace(colonShortcodePattern, (_match, code: string) => {
    const lower = code.toLowerCase();
    return COLON_SHORTCODES[lower] ?? _match;
  });

  const urlSlots: string[] = [];
  const PLACEHOLDER = '\x00URL';
  result = result.replace(URL_SHIELD_RE, (m) => {
    urlSlots.push(m);
    return `${PLACEHOLDER}${urlSlots.length - 1}\x00`;
  });

  result = result.replace(textShortcutPattern, (match) => {
    return TEXT_SHORTCUTS[match] ?? match;
  });

  result = result.replace(/\x00URL(\d+)\x00/g, (_m, idx: string) => {
    return urlSlots[Number(idx)] ?? '';
  });

  return result;
}
