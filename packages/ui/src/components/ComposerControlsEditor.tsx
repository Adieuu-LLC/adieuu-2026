import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Popover, Portal, SegmentGroup, Switch, usePopoverContext } from '@ark-ui/react';
import { Icon } from '../icons/Icon';
import { Tooltip } from './Tooltip';
import type {
  ComposerControlConfig,
  ComposerControlId,
  ComposerControlSide,
  ComposerSendIconId,
} from './composer/composerTypes';
import {
  COMPOSER_SEND_ICON_OPTIONS,
  saveComposerControls,
  useComposerControlsPreference,
} from '../hooks/useComposerControlsPreference';
import { ComposerSendIcon } from './composer/ComposerSendIcon';

const CONTROL_LABEL_KEYS: Record<ComposerControlId, string> = {
  forwardSecrecy: 'composerControls.forwardSecrecy',
  timedMessage: 'composerControls.timedMessage',
  upload: 'composerControls.upload',
  gif: 'composerControls.gif',
  emoji: 'composerControls.emoji',
  send: 'composerControls.send',
};

const CONTROL_DEFAULT_LABELS: Record<ComposerControlId, string> = {
  forwardSecrecy: 'Forward Secrecy',
  timedMessage: 'Timed message',
  upload: 'Upload',
  gif: 'GIF / Stickers',
  emoji: 'Emoji',
  send: 'Send',
};

const SEND_ICON_LABEL_KEYS: Record<ComposerSendIconId, string> = {
  'paper-plane': 'composerControls.sendIconPaperPlane',
  mailbox: 'composerControls.sendIconMailbox',
  'arrow-right': 'composerControls.sendIconArrowRight',
  'message-arrow-up': 'composerControls.sendIconMessageArrowUp',
  'message-arrow-up-right': 'composerControls.sendIconMessageArrowUpRight',
};

const SEND_ICON_DEFAULT_LABELS: Record<ComposerSendIconId, string> = {
  'paper-plane': 'Paper plane',
  mailbox: 'Mailbox',
  'arrow-right': 'Arrow right',
  'message-arrow-up': 'Message arrow up',
  'message-arrow-up-right': 'Message arrow up-right',
};

function ComposerControlSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const tooltip = t('composerControls.toggleTooltip', 'Toggle on/off this control');

  return (
    <Tooltip content={tooltip} position="top">
      <span className="composer-controls-editor__switch-wrap">
        <Switch.Root
          className="composer-controls-editor__switch"
          checked={checked}
          aria-label={tooltip}
          onCheckedChange={(details) => onCheckedChange(details.checked)}
        >
          <Switch.Control className="composer-controls-editor__switch-control">
            <Switch.Thumb className="composer-controls-editor__switch-thumb" />
          </Switch.Control>
          <Switch.HiddenInput />
        </Switch.Root>
      </span>
    </Tooltip>
  );
}

function SendDisplayTextSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = t('composerControls.displayText', 'Display Text');

  return (
    <Switch.Root
      className="composer-controls-editor__popover-switch"
      checked={checked}
      onCheckedChange={(details) => onCheckedChange(details.checked)}
    >
      <Switch.Label className="composer-controls-editor__popover-switch-label">{label}</Switch.Label>
      <Switch.Control className="composer-controls-editor__switch-control">
        <Switch.Thumb className="composer-controls-editor__switch-thumb" />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch.Root>
  );
}

function controlPreview(id: ComposerControlId) {
  switch (id) {
    case 'forwardSecrecy':
      return <span className="composer-controls-editor__preview-fs">FS</span>;
    case 'timedMessage':
      return <Icon name="clock" size="sm" />;
    case 'upload':
      return <Icon name="upload" size="sm" />;
    case 'gif':
      return <span className="composer-controls-editor__preview-gif">GIF</span>;
    case 'emoji':
      return <Icon name="smile" size="sm" />;
    default:
      return null;
  }
}

function SendIconOptions({
  value,
  sendShowText,
  onChange,
  onSendShowTextChange,
}: {
  value: ComposerSendIconId;
  sendShowText: boolean;
  onChange: (icon: ComposerSendIconId) => void;
  onSendShowTextChange: (show: boolean) => void;
}) {
  const { t } = useTranslation();
  const popover = usePopoverContext();

  return (
    <>
      <p className="composer-controls-editor__icon-popover-title">
        {t('composerControls.sendIcon', 'Send icon')}
      </p>
      <ul
        className="composer-controls-editor__icon-list"
        role="listbox"
        aria-label={t('composerControls.sendIcon', 'Send icon')}
      >
        {COMPOSER_SEND_ICON_OPTIONS.map((iconId) => (
          <li key={iconId}>
            <button
              type="button"
              role="option"
              aria-selected={value === iconId}
              className={`composer-controls-editor__icon-option${value === iconId ? ' composer-controls-editor__icon-option--active' : ''}`}
              onClick={() => {
                onChange(iconId);
                popover.setOpen(false);
              }}
            >
              <ComposerSendIcon icon={iconId} className="composer-controls-editor__icon-option-icon" />
              <span>{t(SEND_ICON_LABEL_KEYS[iconId] as never, SEND_ICON_DEFAULT_LABELS[iconId])}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="composer-controls-editor__icon-popover-divider" role="separator" />
      <SendDisplayTextSwitch checked={sendShowText} onCheckedChange={onSendShowTextChange} />
    </>
  );
}

function SendIconPreview({
  value,
  sendShowText,
  onChange,
  onSendShowTextChange,
}: {
  value: ComposerSendIconId;
  sendShowText: boolean;
  onChange: (icon: ComposerSendIconId) => void;
  onSendShowTextChange: (show: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Popover.Root positioning={{ placement: 'bottom-start', gutter: 8 }}>
      <Popover.Trigger
        type="button"
        className={`composer-controls-editor__preview composer-controls-editor__preview--interactive${sendShowText ? ' composer-controls-editor__preview--with-label' : ''}`}
        aria-label={t('composerControls.changeIcon', 'Change icon')}
      >
        {sendShowText && (
          <span className="composer-controls-editor__preview-send-label">
            {t('composerControls.send', 'Send')}
          </span>
        )}
        <ComposerSendIcon icon={value} className="composer-controls-editor__preview-send" />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content className="popover-content composer-controls-editor__icon-popover">
            <SendIconOptions
              value={value}
              sendShowText={sendShowText}
              onChange={onChange}
              onSendShowTextChange={onSendShowTextChange}
            />
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

export type ComposerControlsEditorVariant = 'full' | 'compact';

export function ComposerControlsEditor({ variant = 'full' }: { variant?: ComposerControlsEditorVariant }) {
  const { t } = useTranslation();
  const isCompact = variant === 'compact';
  const controls = useComposerControlsPreference();
  const [draggingId, setDraggingId] = useState<ComposerControlId | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ id: ComposerControlId; startY: number; pointerId: number } | null>(null);

  const sortedControls = useMemo(
    () => [...controls].sort((a, b) => a.order - b.order),
    [controls],
  );

  const updateControls = useCallback((next: ComposerControlConfig[]) => {
    saveComposerControls(next);
  }, []);

  const handleToggle = useCallback((id: ComposerControlId, enabled: boolean) => {
    updateControls(controls.map((c) => (c.id === id ? { ...c, enabled } : c)));
  }, [controls, updateControls]);

  const handleSideChange = useCallback((id: ComposerControlId, side: ComposerControlSide) => {
    updateControls(controls.map((c) => (c.id === id ? { ...c, side } : c)));
  }, [controls, updateControls]);

  const handleSendIconChange = useCallback((sendIcon: ComposerSendIconId) => {
    updateControls(controls.map((c) => (c.id === 'send' ? { ...c, sendIcon } : c)));
  }, [controls, updateControls]);

  const handleSendShowTextChange = useCallback((sendShowText: boolean) => {
    updateControls(controls.map((c) => (c.id === 'send' ? { ...c, sendShowText } : c)));
  }, [controls, updateControls]);

  const reorderByIndex = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...sortedControls];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    updateControls(next.map((control, index) => ({ ...control, order: index })));
  }, [sortedControls, updateControls]);

  const handlePointerDown = useCallback((id: ComposerControlId, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragStateRef.current = { id, startY: event.clientY, pointerId: event.pointerId };
    setDraggingId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-control-id]'));
    const pointerY = event.clientY;
    let targetIndex = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (pointerY < midpoint) {
        targetIndex = i;
        break;
      }
    }
    const fromIndex = sortedControls.findIndex((c) => c.id === drag.id);
    if (fromIndex !== -1 && fromIndex !== targetIndex) {
      reorderByIndex(fromIndex, targetIndex);
    }
  }, [reorderByIndex, sortedControls]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className={`composer-controls-editor${isCompact ? ' composer-controls-editor--compact' : ''}`}>
      {isCompact ? (
        <>
          <p className="composer-controls-editor__compact-note">
            {t(
              'composerControls.compactHint',
              'Toggle which controls appear in your composer. Order, side placement, and send icon can be customized in Appearance settings.',
            )}
          </p>
          <Link
            to="/identity/appearance#composer-controls"
            className="composer-controls-editor__appearance-link"
          >
            {t('composerControls.openAppearanceSettings', 'Open composer controls in Appearance')}
            <Icon name="arrowRight" size="sm" />
          </Link>
        </>
      ) : (
        <p className="composer-controls-editor__hint">
          {t(
            'composerControls.hint',
            'Choose which composer controls appear, which side they sit on, and their order. These settings apply only on this device.',
          )}
        </p>
      )}
      <div className="composer-controls-editor__list" ref={isCompact ? undefined : listRef}>
        {sortedControls.map((control) => (
          isCompact ? (
            <div
              key={control.id}
              className={`composer-controls-editor__row composer-controls-editor__row--compact${!control.enabled ? ' composer-controls-editor__row--disabled' : ''}`}
            >
              <span className="composer-controls-editor__title">
                {t(CONTROL_LABEL_KEYS[control.id] as never, CONTROL_DEFAULT_LABELS[control.id])}
              </span>
              <ComposerControlSwitch
                checked={control.enabled}
                onCheckedChange={(enabled) => handleToggle(control.id, enabled)}
              />
            </div>
          ) : (
          <div
            key={control.id}
            data-control-id={control.id}
            className={`composer-controls-editor__row${draggingId === control.id ? ' composer-controls-editor__row--dragging' : ''}${!control.enabled ? ' composer-controls-editor__row--disabled' : ''}`}
          >
            <button
              type="button"
              className="composer-controls-editor__drag-handle"
              aria-label={t('composerControls.reorder', 'Reorder control')}
              onPointerDown={(e) => handlePointerDown(control.id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <Icon name="bars" size="sm" />
            </button>

            {control.id === 'send' ? (
              <SendIconPreview
                value={control.sendIcon ?? 'paper-plane'}
                sendShowText={control.sendShowText ?? false}
                onChange={handleSendIconChange}
                onSendShowTextChange={handleSendShowTextChange}
              />
            ) : (
              <div className="composer-controls-editor__preview" aria-hidden>
                {controlPreview(control.id)}
              </div>
            )}

            <div className="composer-controls-editor__meta">
              <span className="composer-controls-editor__title">
                {t(CONTROL_LABEL_KEYS[control.id] as never, CONTROL_DEFAULT_LABELS[control.id])}
              </span>
              <ComposerControlSwitch
                checked={control.enabled}
                onCheckedChange={(enabled) => handleToggle(control.id, enabled)}
              />
            </div>

            <Tooltip
              content={t('composerControls.sideTooltip', 'Which side should this control be on?')}
              position="top"
            >
              <div className="composer-controls-editor__side">
                <SegmentGroup.Root
                  className="composer-controls-editor__segment-group"
                  value={control.side}
                  onValueChange={(e) => handleSideChange(control.id, e.value as ComposerControlSide)}
                >
                  <SegmentGroup.Indicator className="composer-controls-editor__segment-indicator" />
                  <SegmentGroup.Item className="composer-controls-editor__segment-item" value="left">
                    <SegmentGroup.ItemText>{t('composerControls.left', 'Left')}</SegmentGroup.ItemText>
                    <SegmentGroup.ItemControl />
                    <SegmentGroup.ItemHiddenInput />
                  </SegmentGroup.Item>
                  <SegmentGroup.Item className="composer-controls-editor__segment-item" value="right">
                    <SegmentGroup.ItemText>{t('composerControls.right', 'Right')}</SegmentGroup.ItemText>
                    <SegmentGroup.ItemControl />
                    <SegmentGroup.ItemHiddenInput />
                  </SegmentGroup.Item>
                </SegmentGroup.Root>
              </div>
            </Tooltip>
          </div>
          )
        ))}
      </div>
    </div>
  );
}
