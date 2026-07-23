/**
 * Reaction emoji allow-list, shared by the client and the API.
 *
 * A reaction value must be one of:
 * - a custom emoji token: `custom:<24-hex id>`
 * - a custom emoji shortcode token: `:shortcode:`
 * - a native Unicode emoji sequence (single emoji, including ZWJ sequences,
 *   skin tones, flags, keycaps, and tag sequences)
 *
 * Arbitrary text must never be accepted — reactions are rendered verbatim in
 * every recipient's UI.
 */

import { CUSTOM_EMOJI_SHORTCODE_BODY_RE } from './custom-emoji-shortcode';

/** Max UTF-16 length of a reaction value (matches storage/schema cap). */
export const REACTION_EMOJI_MAX_LENGTH = 32;

/** `custom:<ObjectId>` token as sent by the emoji picker. */
export const CUSTOM_REACTION_TOKEN_RE = /^custom:[0-9a-f]{24}$/i;

const SHORTCODE_TOKEN_RE = /^:([a-z0-9_-]{2,32}):$/i;

/** Keycap emoji: 0-9, # or * followed by optional VS16 and U+20E3. */
const KEYCAP_RE = /^[0-9#*]\uFE0F?\u20E3$/u;

/** Flag emoji: exactly two regional indicator symbols. */
const FLAG_RE = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;

/**
 * Characters allowed to accompany pictographic code points inside a single
 * emoji sequence: ZWJ, variation selectors, skin tones, keycap combining
 * mark, and tag characters (subdivision flags).
 */
const EMOJI_JOINER_OR_MODIFIER_RE =
  /^[\u200D\uFE0E\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]$/u;

const PICTOGRAPHIC_RE = /^\p{Extended_Pictographic}$/u;

function isUnicodeEmojiSequence(value: string): boolean {
  if (KEYCAP_RE.test(value)) return true;
  if (FLAG_RE.test(value)) return true;

  let pictographs = 0;
  for (const ch of value) {
    if (PICTOGRAPHIC_RE.test(ch)) {
      pictographs++;
      continue;
    }
    if (!EMOJI_JOINER_OR_MODIFIER_RE.test(ch)) return false;
  }
  return pictographs > 0;
}

/**
 * Whether a reaction payload value is an allowed emoji: a custom emoji
 * token, a shortcode token, or a native Unicode emoji sequence.
 */
export function isValidReactionEmoji(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > REACTION_EMOJI_MAX_LENGTH) return false;
  if (CUSTOM_REACTION_TOKEN_RE.test(value)) return true;
  const shortcode = SHORTCODE_TOKEN_RE.exec(value);
  if (shortcode) return CUSTOM_EMOJI_SHORTCODE_BODY_RE.test(shortcode[1]!.toLowerCase());
  return isUnicodeEmojiSequence(value);
}
