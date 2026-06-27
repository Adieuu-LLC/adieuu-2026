import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import {
  ACCOUNT_MODERATION_CATEGORIES,
  type AccountModerationCategory,
} from '@adieuu/shared';
import { Icon } from '../icons/Icon';

const NONE_VALUE = '';

export interface ModerationCategorySelectProps {
  value: AccountModerationCategory | '';
  onChange: (category: AccountModerationCategory | '') => void;
  disabled?: boolean;
}

export function ModerationCategorySelect({
  value,
  onChange,
  disabled,
}: ModerationCategorySelectProps) {
  const { t } = useTranslation();

  const collection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: NONE_VALUE, label: t('admin.users.modals.categoryNone') },
          ...ACCOUNT_MODERATION_CATEGORIES.map((category) => ({
            value: category,
            label: t(`admin.users.modals.categories.${category}`, category),
          })),
        ],
      }),
    [t],
  );

  const selectedValue = value || NONE_VALUE;

  return (
    <Select.Root
      collection={collection}
      value={[selectedValue]}
      onValueChange={(details) => {
        const next = details.value[0] ?? NONE_VALUE;
        onChange(next === NONE_VALUE ? '' : (next as AccountModerationCategory));
      }}
      disabled={disabled}
      positioning={{ sameWidth: true }}
    >
      <Select.Control className="report-select-control">
        <Select.Trigger className="report-select-trigger">
          <Select.ValueText placeholder={t('admin.users.modals.categoryPreset')} />
          <Select.Indicator className="report-select-indicator">
            <Icon name="chevronDown" size="xs" />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content className="report-select-content">
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item} className="report-select-item">
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator className="report-select-item-indicator">
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
