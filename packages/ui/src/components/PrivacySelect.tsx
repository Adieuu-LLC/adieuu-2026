/**
 * PrivacySelect - inline dropdown for per-field visibility control.
 *
 * Uses Ark UI Select for accessible, styled dropdown rendering.
 * Displays Public / Friends / Only me options with a compact trigger.
 */

import { useMemo } from 'react';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import type { ProfileVisibility } from '@adieuu/shared';
import { Icon } from '../icons/Icon';

export interface PrivacySelectProps {
  value: ProfileVisibility;
  onChange: (value: ProfileVisibility) => void;
  label?: string;
  disabled?: boolean;
}

const VISIBILITY_OPTIONS: { value: ProfileVisibility; labelKey: string }[] = [
  { value: 'public', labelKey: 'identity.profile.privacyPublic' },
  { value: 'friends', labelKey: 'identity.profile.privacyFriends' },
  { value: 'private', labelKey: 'identity.profile.privacyPrivate' },
];

export function PrivacySelect({ value, onChange, label, disabled }: PrivacySelectProps) {
  const { t } = useTranslation();

  const collection = useMemo(
    () =>
      createListCollection({
        items: VISIBILITY_OPTIONS.map((opt) => ({
          value: opt.value,
          label: t(opt.labelKey),
        })),
      }),
    [t]
  );

  const selectedLabel = VISIBILITY_OPTIONS.find((o) => o.value === value);

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={(details) => {
        const next = details.value[0] as ProfileVisibility | undefined;
        if (next) onChange(next);
      }}
      disabled={disabled}
      positioning={{ sameWidth: true }}
    >
      <Select.Control className="privacy-select-control">
        {label && (
          <Select.Label className="privacy-select-label">{label}</Select.Label>
        )}
        <Select.Trigger className="privacy-select-trigger">
          <Select.ValueText>
            {selectedLabel ? t(selectedLabel.labelKey) : ''}
          </Select.ValueText>
          <Select.Indicator className="privacy-select-indicator">
            <Icon name="chevronDown" size="xs" />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>

      <Portal>
        <Select.Positioner>
          <Select.Content className="privacy-select-content">
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item} className="privacy-select-item">
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator className="privacy-select-item-indicator">
                  <Icon name="check" size="xs" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}

