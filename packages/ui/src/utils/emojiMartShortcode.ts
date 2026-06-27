/**
 * Resolve colon shortcodes for native emoji using the same dataset as emoji-mart,
 * with fallback to {@link getShortcode} from our composer shortcuts map.
 */

import data from '@emoji-mart/data';
import type { EmojiMartData } from '@emoji-mart/data';
import { getShortcode as getLegacyShortcode } from './emojiShortcodes';

const mart = data as EmojiMartData;

let nativeToColonLabel: Map<string, string> | null = null;

function ensureNativeMap(): Map<string, string> {
  if (nativeToColonLabel) return nativeToColonLabel;
  const m = new Map<string, string>();
  for (const id of Object.keys(mart.emojis)) {
    const emoji = mart.emojis[id];
    if (!emoji) continue;
    for (const skin of emoji.skins) {
      const { native } = skin;
      if (native && !m.has(native)) {
        m.set(native, `:${id}:`);
      }
    }
  }
  nativeToColonLabel = m;
  return m;
}

/** Colon shortcode for tooltips, e.g. `:thumbsup:` (aligned with emoji-mart). */
export function getEmojiMartShortcodeLabel(native: string): string {
  return ensureNativeMap().get(native) ?? getLegacyShortcode(native);
}
