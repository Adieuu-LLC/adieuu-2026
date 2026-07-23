/**
 * SegmentGroup permission toggle (No / Yes / Manage) styled like the
 * GIF content-filter control in Conversation settings.
 */

import { SegmentGroup } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import {
  spacePermissionToggleOptions,
  type SpacePermissionDef,
  type SpacePermissionToggleValue,
} from '@adieuu/shared';

interface SpaceRolePermissionToggleProps {
  def: SpacePermissionDef;
  value: SpacePermissionToggleValue;
  onChange: (value: SpacePermissionToggleValue) => void;
  disabled?: boolean;
}

export function SpaceRolePermissionToggle({
  def,
  value,
  onChange,
  disabled,
}: SpaceRolePermissionToggleProps) {
  const { t } = useTranslation();
  const options = spacePermissionToggleOptions(def.toggle);

  return (
    <div
      className={`space-role-perm-row conversation-settings-content-filter${disabled ? ' conversation-settings-content-filter--disabled' : ''}`}
    >
      <div className="space-role-perm-copy">
        <span className="app-settings-toggle-title">
          {t(`spaces.permissions.${def.id}.title` as never)}
        </span>
        <span className="app-settings-toggle-hint">
          {t(`spaces.permissions.${def.id}.description` as never)}
        </span>
      </div>
      <SegmentGroup.Root
        className="content-filter-segment-group"
        value={value}
        onValueChange={(e) => {
          if (e.value) onChange(e.value as SpacePermissionToggleValue);
        }}
        disabled={disabled}
      >
        <SegmentGroup.Indicator className="content-filter-segment-indicator" />
        {options.map((opt) => (
          <SegmentGroup.Item
            key={opt}
            className="content-filter-segment-item"
            value={opt}
            disabled={disabled}
          >
            <SegmentGroup.ItemText>
              {t(`spaces.permissions.toggle.${opt}` as never)}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
    </div>
  );
}
