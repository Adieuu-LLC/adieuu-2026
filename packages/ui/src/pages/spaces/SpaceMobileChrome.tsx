/**
 * Compact mobile Space chrome: channel drawer toggle + Home/channel Select.
 */

import { useMemo } from 'react';
import { useNavigate, useParams, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';
import { useSpaceCipher } from './useSpaceCipher';
import { resolveChannelDisplayName } from './spaceMetadataCipher';

const HOME_VALUE = '__home__';

interface SpaceMobileChromeProps {
  isMobileNavOpen: boolean;
  onToggleNav: () => void;
  onNavigate: () => void;
}

export function SpaceMobileChrome({
  isMobileNavOpen,
  onToggleNav,
  onNavigate,
}: SpaceMobileChromeProps) {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const channelMatch = useMatch('/s/:slug/c/:channelId');
  const { activeSpace, channels } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);

  const collection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: HOME_VALUE, label: t('spaces.sidebar.home') },
          ...channels.map((ch) => ({
            value: ch.id,
            label: `#${resolveChannelDisplayName(ch, spaceCipher, {
              encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
            })}`,
          })),
        ],
      }),
    [channels, spaceCipher, t],
  );

  const selectedValue = channelMatch?.params.channelId ?? HOME_VALUE;
  const selectedLabel =
    collection.items.find((item) => item.value === selectedValue)?.label ??
    t('spaces.sidebar.selectChannel');

  return (
    <div className="space-mobile-chrome">
      <div className="space-mobile-chrome-select">
        <Select.Root
          collection={collection}
          value={[selectedValue]}
          onValueChange={(details) => {
            const next = details.value[0];
            if (!next || !slug) return;
            if (next === HOME_VALUE) {
              navigate(`/s/${slug}`);
            } else {
              navigate(`/s/${slug}/c/${next}`);
            }
            onNavigate();
          }}
          positioning={{ sameWidth: true }}
        >
          <Select.Control className="space-mobile-chrome-select-control">
            <Select.Trigger
              className="space-mobile-chrome-select-trigger"
              aria-label={t('spaces.sidebar.selectChannel')}
            >
              <Select.ValueText placeholder={t('spaces.sidebar.selectChannel')}>
                {selectedLabel}
              </Select.ValueText>
              <Select.Indicator className="space-mobile-chrome-select-indicator">
                <Icon name="chevronDown" size="xs" />
              </Select.Indicator>
            </Select.Trigger>
          </Select.Control>

          <Portal>
            <Select.Positioner>
              <Select.Content className="space-mobile-chrome-select-content">
                {collection.items.map((item) => (
                  <Select.Item
                    key={item.value}
                    item={item}
                    className="space-mobile-chrome-select-item"
                  >
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className="space-mobile-chrome-select-check">
                      <Icon name="check" size="xs" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
      </div>

      <button
        type="button"
        className="space-mobile-chrome-menu"
        onClick={onToggleNav}
        aria-label={
          isMobileNavOpen
            ? t('spaces.sidebar.closeMenu')
            : t('spaces.sidebar.openMenu')
        }
        aria-expanded={isMobileNavOpen}
      >
        {isMobileNavOpen ? (
          <Icon name="x" size="sm" />
        ) : (
          <Icon name="bars" size="sm" />
        )}
      </button>
    </div>
  );
}
