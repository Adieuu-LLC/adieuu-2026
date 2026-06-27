/**
 * ProfileColorPicker - colour picker for profile accent colours.
 *
 * Shows a custom swatch that either displays the chosen colour or a
 * recognisable "default / unset" indicator (dashed border with diagonal
 * strike). Clicking the swatch opens the native colour picker dialog.
 * A clear button resets back to the theme default.
 */

import { useCallback, useId, useRef } from 'react';

export interface ProfileColorPickerProps {
  label: string;
  value?: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}

export function ProfileColorPicker({
  label,
  value,
  onChange,
  disabled,
}: ProfileColorPickerProps) {
  const colorInputId = useId();
  const colorInputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onChange(null);
    },
    [onChange]
  );

  const handleSwatchClick = useCallback(() => {
    if (!disabled) {
      colorInputRef.current?.click();
    }
  }, [disabled]);

  return (
    <div className="profile-color-picker">
      <label className="profile-color-picker-label" htmlFor={colorInputId}>{label}</label>
      <div className="profile-color-picker-controls">
        {/* Hidden native input — only used to open the browser colour dialog */}
        <input
          id={colorInputId}
          ref={colorInputRef}
          type="color"
          value={value || '#808080'}
          onChange={handleChange}
          disabled={disabled}
          className="profile-color-picker-native"
          tabIndex={-1}
          aria-hidden
        />

        {/* Visible swatch */}
        <button
          type="button"
          className={`profile-color-picker-swatch ${!value ? 'profile-color-picker-swatch--default' : ''}`}
          style={value ? { backgroundColor: value } : undefined}
          onClick={handleSwatchClick}
          disabled={disabled}
          aria-label={value ? `Change ${label}` : `Set ${label}`}
        >
          {!value && (
            <svg
              className="profile-color-picker-strike"
              viewBox="0 0 36 36"
              aria-hidden="true"
            >
              <line x1="4" y1="4" x2="32" y2="32" />
            </svg>
          )}
        </button>

        {value && (
          <button
            type="button"
            className="profile-color-picker-clear"
            onClick={handleClear}
            disabled={disabled}
            aria-label={`Clear ${label}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <span className="profile-color-picker-value">
          {value || 'Default'}
        </span>
      </div>
    </div>
  );
}
