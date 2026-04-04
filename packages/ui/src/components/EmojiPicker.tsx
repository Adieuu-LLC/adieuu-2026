/**
 * EmojiPicker component wrapping @emoji-mart/react.
 *
 * Provides a themed emoji picker that integrates with the app's
 * CSS custom properties. Compact mode is used for reactions (smaller grid,
 * no category nav); full mode for the composer. Search is shown in both.
 */

import { useCallback } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

export interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  compact?: boolean;
  autoFocus?: boolean;
}

interface EmojiMartEmojiData {
  native: string;
  id: string;
  shortcodes?: string;
}

export function EmojiPicker({
  onEmojiSelect,
  compact = false,
  autoFocus = true,
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
    <div className={`emoji-picker-wrapper${compact ? ' emoji-picker-wrapper--compact' : ''}`}>
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme="dark"
        set="native"
        autoFocus={autoFocus}
        perLine={compact ? 7 : 9}
        maxFrequentRows={compact ? 1 : 4}
        previewPosition={compact ? 'none' : 'bottom'}
        skinTonePosition={compact ? 'none' : 'preview'}
        navPosition={compact ? 'none' : 'top'}
        searchPosition="sticky"
      />
    </div>
  );
}
