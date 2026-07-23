import { useTranslation } from 'react-i18next';
import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
  AccordionItemIndicator,
  Switch,
} from '@ark-ui/react';
import { Icon } from '../icons/Icon';
import {
  patchMemberColorDisplay,
  useMemberColorPreference,
  type MemberColorDisplay,
} from '../hooks/useMemberColorPreference';

const TOGGLES: readonly {
  key: keyof MemberColorDisplay;
  labelKey: string;
  fallback: string;
}[] = [
  { key: 'name', labelKey: 'conversations.colorDisplayName', fallback: 'Name' },
  {
    key: 'avatarAccent',
    labelKey: 'conversations.colorDisplayAvatarAccent',
    fallback: 'Avatar accent',
  },
  {
    key: 'messageBorder',
    labelKey: 'conversations.colorDisplayMessageBorder',
    fallback: 'Message border',
  },
];

/** Compact, collapsed-by-default control for the Members sidebar. */
export function MemberColorDisplayControl() {
  const { t } = useTranslation();
  const memberColorDisplay = useMemberColorPreference();

  return (
    <div className="conversation-members-color-display">
      <AccordionRoot collapsible defaultValue={[]} className="conversation-members-color-accordion">
        <AccordionItem value="color-display" className="conversation-members-color-accordion-item">
          <AccordionItemTrigger
            type="button"
            className="conversation-members-color-accordion-trigger"
          >
            <span className="conversation-members-color-accordion-title">
              {t('conversations.colorDisplayMode', 'Color Display Options')}
            </span>
            <AccordionItemIndicator className="conversation-members-color-accordion-indicator">
              <Icon name="chevronDown" size="sm" />
            </AccordionItemIndicator>
          </AccordionItemTrigger>
          <AccordionItemContent className="conversation-members-color-accordion-content">
            <div className="conversation-members-color-switches">
              {TOGGLES.map(({ key, labelKey, fallback }) => (
                <Switch.Root
                  key={key}
                  checked={memberColorDisplay[key]}
                  onCheckedChange={(details) => {
                    patchMemberColorDisplay({ [key]: details.checked });
                  }}
                  className="sidebar-filter-switch"
                >
                  <Switch.Label className="sidebar-filter-switch-label">
                    {t(labelKey, fallback)}
                  </Switch.Label>
                  <Switch.Control className="sidebar-filter-switch-control">
                    <Switch.Thumb className="sidebar-filter-switch-thumb" />
                  </Switch.Control>
                  <Switch.HiddenInput />
                </Switch.Root>
              ))}
            </div>
          </AccordionItemContent>
        </AccordionItem>
      </AccordionRoot>
    </div>
  );
}
