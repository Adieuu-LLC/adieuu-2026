/**
 * Reusable emoji picker component wrapping emoji-mart.
 * Used for both inline message composition and reaction picking.
 * Designed to support custom emoji sets in the future.
 */

import { memo, useCallback } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

export interface EmojiPickerProps {
  /** Called when an emoji is selected */
  onEmojiSelect: (emoji: string) => void;
  /** Whether to show a compact/minimal picker (for reactions) */
  compact?: boolean;
}

interface EmojiMartEmojiData {
  native: string;
  id: string;
  shortcodes?: string;
}

export const EmojiPicker = memo(function EmojiPicker({
  onEmojiSelect,
  compact = false,
}: EmojiPickerProps) {
  const handleSelect = useCallback(
    (emoji: EmojiMartEmojiData) => {
      if (emoji.native) {
        onEmojiSelect(emoji.native);
      }
    },
    [onEmojiSelect]
  );

  return (
    <div className="emoji-picker-container">
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme="dark"
        set="native"
        previewPosition={compact ? 'none' : 'bottom'}
        skinTonePosition={compact ? 'none' : 'preview'}
        perLine={compact ? 7 : 9}
        maxFrequentRows={compact ? 1 : 4}
        navPosition={compact ? 'none' : 'top'}
        searchPosition={compact ? 'none' : 'sticky'}
      />
    </div>
  );
});
