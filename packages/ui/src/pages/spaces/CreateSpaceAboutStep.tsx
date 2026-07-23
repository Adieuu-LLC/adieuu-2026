/**
 * Create-Space wizard About step: name, optional URL (not for Hidden),
 * description, allow free members.
 */

import { useTranslation } from 'react-i18next';
import {
  SPACE_DESCRIPTION_MAX_LENGTH,
  SPACE_NAME_MAX_LENGTH,
  SPACE_SLUG_MAX_LENGTH,
  type SpaceVisibility,
} from '@adieuu/shared';
import { Input } from '../../components/Input';

export type SlugState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

export interface CreateSpaceAboutStepProps {
  visibility: SpaceVisibility;
  name: string;
  onNameChange: (value: string) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  slugStatus: { text: string; tone: 'ok' | 'error' | 'muted' } | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  allowFreeMembers: boolean;
  onAllowFreeMembersChange: (value: boolean) => void;
  disabled: boolean;
}

export function CreateSpaceAboutStep({
  visibility,
  name,
  onNameChange,
  slug,
  onSlugChange,
  slugStatus,
  description,
  onDescriptionChange,
  allowFreeMembers,
  onAllowFreeMembersChange,
  disabled,
}: CreateSpaceAboutStepProps) {
  const { t } = useTranslation();
  const showSlug = visibility !== 'hidden';

  return (
    <div className="space-create-step">
      <Input
        id="space-name"
        label={t('spaces.create.nameLabel')}
        hint={t('spaces.create.nameHint')}
        value={name}
        maxLength={SPACE_NAME_MAX_LENGTH}
        placeholder={t('spaces.create.namePlaceholder')}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={disabled}
        autoFocus
      />

      {showSlug ? (
        <div className="form-group">
          <Input
            id="space-slug"
            label={t('spaces.create.slugLabel')}
            hint={t('spaces.create.slugHint')}
            value={slug}
            maxLength={SPACE_SLUG_MAX_LENGTH}
            onChange={(e) => onSlugChange(e.target.value)}
            disabled={disabled}
          />
          {slugStatus && (
            <p
              className={`space-create-slug-status space-create-slug-status--${slugStatus.tone}`}
              role="status"
              aria-live="polite"
            >
              {slugStatus.text}
            </p>
          )}
        </div>
      ) : (
        <p className="space-create-hint" role="note">
          {t('spaces.create.hiddenNoSlugHint')}
        </p>
      )}

      <div className="form-group">
        <label htmlFor="space-description" className="input-label">
          {t('spaces.create.descriptionLabel')}{' '}
          <span className="form-optional">{t('spaces.create.optional')}</span>
        </label>
        <textarea
          id="space-description"
          className="input space-create-textarea"
          value={description}
          maxLength={SPACE_DESCRIPTION_MAX_LENGTH}
          placeholder={t('spaces.create.descriptionPlaceholder')}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>

      <label className="space-create-checkbox">
        <input
          id="space-allow-free"
          type="checkbox"
          checked={allowFreeMembers}
          onChange={(e) => onAllowFreeMembersChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="space-create-checkbox-body">
          <span className="space-create-radio-title">
            {t('spaces.create.allowFreeMembersLabel')}
          </span>
          <span className="space-create-radio-desc">
            {t('spaces.create.allowFreeMembersHint')}
          </span>
        </span>
      </label>
    </div>
  );
}
