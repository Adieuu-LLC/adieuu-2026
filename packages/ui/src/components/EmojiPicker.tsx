/**
 * Reusable emoji picker component wrapping emoji-mart.
 * Used for both inline message composition and reaction picking.
 * Designed to support custom emoji sets in the future.
 */

import { memo, useCallback, useMemo } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from '../hooks/useTheme';
import { getBuiltinThemeDefinition } from '../constants/builtinThemes';

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
  const { activeTheme } = useTheme();

  const emojiTheme = useMemo(() => {
    if (!activeTheme) return 'dark';
    const daylight = getBuiltinThemeDefinition('daylight');
    if (daylight && activeTheme.id === 'daylight') return 'light';
    const bg = activeTheme.colors.bgPrimary;
    if (bg.startsWith('#')) {
      const hex = bg.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? 'light' : 'dark';
    }
    return 'dark';
  }, [activeTheme]);

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
        theme={emojiTheme}
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
