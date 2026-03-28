/**
 * ProfileColorPicker - colour picker for profile accent colours.
 *
 * Simple native colour input with label, using CSS variables for styling.
 * Supports optional clear/reset to remove a colour.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t: _t } = useTranslation();

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

  return (
    <div className="profile-color-picker">
      <label className="profile-color-picker-label">{label}</label>
      <div className="profile-color-picker-controls">
        <input
          type="color"
          value={value || '#22d3ee'}
          onChange={handleChange}
          disabled={disabled}
          className="profile-color-picker-input"
        />
        {value && (
          <button
            type="button"
            className="profile-color-picker-clear"
            onClick={handleClear}
            disabled={disabled}
            aria-label={`Clear ${label}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
