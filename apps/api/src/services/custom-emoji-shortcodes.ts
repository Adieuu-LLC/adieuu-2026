/**
 * Set of built-in emoji shortcodes used by the platform.
 *
 * Maintained server-side for custom emoji shortcode validation.
 * A custom emoji shortcode must NOT collide with any of these.
 *
 * Keep in sync with COLON_SHORTCODES in packages/ui/src/utils/emojiShortcodes.ts.
 */

export const COLON_SHORTCODES_SET: ReadonlySet<string> = new Set([
  'thumbsup', 'thumbs_up', '+1',
  'thumbsdown', 'thumbs_down', '-1',
  'heart', 'fire', 'laugh', 'joy', 'cry', 'sob',
  'clap', 'wave', 'pray', 'eyes', 'rocket',
  'tada', 'party', 'check', 'x', 'star', 'sparkles',
  'skull', 'brain', 'ok', 'ok_hand', 'raised_hands',
  'muscle', 'sweat_smile', 'thinking', 'shrug', 'facepalm',
  'sunglasses', 'wink', 'grimace', 'poop', 'ghost',
  'alien', 'robot', 'angel', 'devil', 'crown',
  'gem', 'ring', 'rose', 'rainbow', 'moon', 'sun',
  'coffee', 'beer', 'pizza', 'cake', 'cookie',
  'dog', 'cat', 'panda', 'unicorn', 'penguin',
  '100', 'lock', 'key', 'shield', 'warning',
  'bulb', 'link', 'pin', 'megaphone', 'bell',
  'wave_hand', 'handshake', 'crossed_fingers', 'victory',
]);
