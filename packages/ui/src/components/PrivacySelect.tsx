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
            <ChevronIcon />
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
                  <CheckIcon />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
