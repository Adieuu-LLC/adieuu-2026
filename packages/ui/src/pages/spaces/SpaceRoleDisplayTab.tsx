/**
 * Role Settings tab: name, color, hoist, mentionable, default role, preview.
 */

import type { PublicSpaceRole } from '@adieuu/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

interface SpaceRoleDisplayTabProps {
  role: PublicSpaceRole;
  saving: boolean;
  previewActive: boolean;
  onSave: (patch: {
    name?: string;
    color?: string;
    displaySeparately?: boolean;
    mentionable?: boolean;
  }) => Promise<boolean>;
  onPreview: () => void;
  onExitPreview: () => void;
}

export function SpaceRoleDisplayTab({
  role,
  saving,
  previewActive,
  onSave,
  onPreview,
  onExitPreview,
}: SpaceRoleDisplayTabProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [displaySeparately, setDisplaySeparately] = useState(role.displaySeparately);
  const [mentionable, setMentionable] = useState(role.mentionable);

  useEffect(() => {
    setName(role.name);
    setColor(role.color);
    setDisplaySeparately(role.displaySeparately);
    setMentionable(role.mentionable);
  }, [role]);

  const dirty =
    name !== role.name ||
    color !== role.color ||
    displaySeparately !== role.displaySeparately ||
    mentionable !== role.mentionable;

  const handleSave = () => {
    if (!HEX_COLOR_RE.test(color)) {
      setColor(role.color);
      return;
    }
    const normalizedColor = color.toLowerCase();
    if (normalizedColor !== color) setColor(normalizedColor);
    void onSave({
      name,
      color: normalizedColor,
      displaySeparately,
      mentionable,
    });
  };

  return (
    <Card className="admin-card space-role-tab-card">
      <label className="admin-field-label">
        {t('spaces.manage.roles.settings.name')}
        <input
          className="admin-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!role.encryptedName}
          maxLength={100}
        />
      </label>

      <label className="admin-field-label">
        {t('spaces.manage.roles.settings.color')}
        <div className="space-role-color-row">
          <input
            type="color"
            className="space-role-color-input"
            value={HEX_COLOR_RE.test(color) ? color : role.color}
            onChange={(e) => setColor(e.target.value)}
          />
          <input
            className="admin-input"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            pattern="^#[0-9a-fA-F]{6}$"
            maxLength={7}
          />
        </div>
      </label>

      <div>
        <label className="admin-toggle">
          <input
            type="checkbox"
            checked={displaySeparately}
            onChange={(e) => setDisplaySeparately(e.target.checked)}
          />
          <span>{t('spaces.manage.roles.settings.displaySeparately')}</span>
        </label>
        <p className="admin-hint">{t('spaces.manage.roles.settings.displaySeparatelyHint')}</p>
      </div>

      <div>
        <label className="admin-toggle">
          <input
            type="checkbox"
            checked={mentionable}
            onChange={(e) => setMentionable(e.target.checked)}
          />
          <span>{t('spaces.manage.roles.settings.mentionable')}</span>
        </label>
        <p className="admin-hint">{t('spaces.manage.roles.settings.mentionableHint')}</p>
      </div>

      {role.systemKey === 'everyone' && (
        <p className="admin-hint">{t('spaces.manage.roles.settings.everyoneAlwaysDefault')}</p>
      )}

      <div className="space-role-display-actions">
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? t('spaces.manage.roles.saving') : t('spaces.manage.roles.save')}
        </Button>
        {previewActive ? (
          <Button variant="secondary" size="sm" onClick={onExitPreview}>
            {t('spaces.manage.roles.exitPreview')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onPreview}>
            {t('spaces.manage.roles.preview')}
          </Button>
        )}
      </div>
    </Card>
  );
}
