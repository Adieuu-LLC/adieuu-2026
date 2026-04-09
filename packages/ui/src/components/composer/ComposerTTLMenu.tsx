import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import { TTL_OPTIONS } from './composerTypes';

export function ComposerTTLMenu({
  ttlSeconds,
  onSelect,
  onAfterSelect,
  options = TTL_OPTIONS,
}: {
  ttlSeconds: number | undefined;
  onSelect: (seconds: number | undefined) => void;
  onAfterSelect?: () => void;
  options?: { label: string; seconds: number }[];
}) {
  const { t } = useTranslation();

  return (
    <Menu.Root
      onSelect={(details) => {
        const val = details.value;
        onSelect(val === 'off' ? undefined : Number(val));
        onAfterSelect?.();
      }}
      positioning={{ placement: 'top-start' }}
    >
      <Tooltip
        content={ttlSeconds
          ? t('conversations.ttlActive', 'Message expires after {{ttl}}', { ttl: options.find((o) => o.seconds === ttlSeconds)?.label ?? '' })
          : t('conversations.ttlOff', 'Set message expiry')
        }
        position="top"
      >
        <span style={{ display: 'inline-flex' }}>
          <Menu.Trigger asChild>
            <button
              type="button"
              className={`conversation-ttl-toggle${ttlSeconds ? ' conversation-ttl-toggle--active' : ''}`}
            >
              <Icon name="clock" />
            </button>
          </Menu.Trigger>
        </span>
      </Tooltip>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="conversation-ttl-menu">
            {ttlSeconds && (
              <Menu.Item value="off" className="conversation-ttl-menu-item conversation-ttl-menu-item--off">
                {t('conversations.ttlDisable', 'Off')}
              </Menu.Item>
            )}
            {options.map((opt) => (
              <Menu.Item
                key={opt.seconds}
                value={String(opt.seconds)}
                className={`conversation-ttl-menu-item${ttlSeconds === opt.seconds ? ' conversation-ttl-menu-item--selected' : ''}`}
              >
                {opt.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
