/**
 * Ark UI Select for notification sound preset (Account settings).
 * Styled for dark/light theme via CSS variables (not native `<select>`).
 */

import { useMemo } from 'react';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import type { BuiltinNotificationSoundId } from '../constants/builtinNotificationSounds';
import type { NotificationSoundId } from '../constants/notificationSoundPreferenceShared';

export interface NotificationSoundSelectLabels {
  none: string;
  custom: string;
}

type SoundItem = { value: NotificationSoundId; label: string };

export interface NotificationSoundSelectProps {
  value: NotificationSoundId;
  disabled?: boolean;
  hasCustomSoundPicker: boolean;
  /** Built-in presets in display order (from `BUILTIN_NOTIFICATION_SOUNDS`). */
  builtinItems: { value: BuiltinNotificationSoundId; label: string }[];
  labels: NotificationSoundSelectLabels;
  onValueChange: (id: NotificationSoundId) => void;
  /**
   * id of an element that names this control (passed as `aria-labelledby`).
   * Do not set `id` on Select.Trigger — Ark/Zag resolves the anchor for positioning by
   * internal id; overriding it breaks the popper and pins the menu to the top-left.
   */
  labelId?: string;
}

export function NotificationSoundSelect({
  value,
  disabled = false,
  hasCustomSoundPicker,
  builtinItems,
  labels,
  onValueChange,
  labelId,
}: NotificationSoundSelectProps) {
  const items = useMemo((): SoundItem[] => {
    const base: SoundItem[] = [
      ...builtinItems.map((b) => ({ value: b.value, label: b.label })),
      { value: 'none', label: labels.none },
    ];
    if (hasCustomSoundPicker) {
      base.push({ value: 'custom', label: labels.custom });
    }
    return base;
  }, [builtinItems, hasCustomSoundPicker, labels]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [items]
  );

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      disabled={disabled}
      onValueChange={(d) => {
        const v = d.value[0];
        if (v) onValueChange(v as NotificationSoundId);
      }}
      positioning={{
        placement: 'bottom-start',
        sameWidth: true,
        strategy: 'fixed',
      }}
    >
      <Select.Control className="app-settings-sound-select-control">
        <Select.Trigger
          className="app-settings-sound-select-trigger"
          {...(labelId ? { 'aria-labelledby': labelId } : {})}
        >
          <Select.ValueText className="app-settings-sound-select-value" />
          <Select.Indicator className="app-settings-sound-select-indicator" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner className="app-settings-sound-select-positioner">
          <Select.Content className="app-settings-sound-select-content">
            <Select.List className="app-settings-sound-select-list">
              {items.map((item) => (
                <Select.Item key={item.value} item={item} className="app-settings-sound-select-item">
                  <Select.ItemText className="app-settings-sound-select-item-text">{item.label}</Select.ItemText>
                  <Select.ItemIndicator className="app-settings-sound-select-item-indicator">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path
                        d="M11.5 3.5L5.25 9.75L2.5 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
