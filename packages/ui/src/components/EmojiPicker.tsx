/**
 * EmojiPicker component wrapping @emoji-mart/react.
 *
 * Provides a themed emoji picker that integrates with the app's
 * CSS custom properties. Compact mode is used for reactions (smaller grid,
 * no category nav); full mode for the composer. Search is shown in both.
 *
 * When customEmojis are provided, a "Custom" category appears at the end
 * of the picker's category nav.
 */

import { useCallback, useMemo } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import type { PublicCustomEmoji } from '@adieuu/shared';

export interface EmojiSelectResult {
  /** Unicode emoji character (set for native emojis) */
  native?: string;
  /** Custom emoji metadata (set for custom emojis) */
  custom?: {
    id: string;
    shortcode: string;
    cdnUrl: string;
    name: string;
    animated: boolean;
  };
}

export interface EmojiPickerProps {
  onEmojiSelect: (result: EmojiSelectResult) => void;
  compact?: boolean;
  autoFocus?: boolean;
  customEmojis?: PublicCustomEmoji[];
}

interface EmojiMartEmojiData {
  native?: string;
  id: string;
  shortcodes?: string;
  src?: string;
}

export function EmojiPicker({
  onEmojiSelect,
  compact = false,
  autoFocus = true,
  customEmojis,
}: EmojiPickerProps) {
  const customCategory = useMemo(() => {
    if (!customEmojis?.length) return undefined;
    return [
      {
        id: 'custom-emojis',
        name: 'Custom',
        emojis: customEmojis.map((e) => ({
          id: `custom-${e.id}`,
          name: e.name,
          keywords: [e.shortcode, e.name],
          skins: [{ src: e.cdnUrl }],
        })),
      },
    ];
  }, [customEmojis]);

  const customEmojiLookup = useMemo(() => {
    if (!customEmojis?.length) return new Map<string, PublicCustomEmoji>();
    return new Map(customEmojis.map((e) => [`custom-${e.id}`, e]));
  }, [customEmojis]);

  const handleSelect = useCallback(
    (emoji: EmojiMartEmojiData) => {
      if (emoji.native) {
        onEmojiSelect({ native: emoji.native });
        return;
      }

      const custom = customEmojiLookup.get(emoji.id);
      if (custom) {
        onEmojiSelect({
          custom: {
            id: custom.id,
            shortcode: custom.shortcode,
            cdnUrl: custom.cdnUrl,
            name: custom.name,
            animated: custom.animated,
          },
        });
      }
    },
    [onEmojiSelect, customEmojiLookup]
  );

  return (
    <div className={`emoji-picker-wrapper${compact ? ' emoji-picker-wrapper--compact' : ''}`}>
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme="dark"
        set="native"
        autoFocus={autoFocus}
        perLine={compact ? 7 : 9}
        maxFrequentRows={compact ? 1 : 4}
        previewPosition="bottom"
        skinTonePosition={compact ? 'none' : 'preview'}
        navPosition={compact ? 'none' : 'top'}
        searchPosition="sticky"
        custom={customCategory}
      />
    </div>
  );
}
