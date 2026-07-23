/**
 * Create-Space wizard step 2: visibility radios.
 */

import { useTranslation } from 'react-i18next';
import { SPACE_VISIBILITY_VALUES, type SpaceVisibility } from '@adieuu/shared';

export interface CreateSpaceVisibilityStepProps {
  visibility: SpaceVisibility;
  onVisibilityChange: (value: SpaceVisibility) => void;
  disabled: boolean;
}

export function CreateSpaceVisibilityStep({
  visibility,
  onVisibilityChange,
  disabled,
}: CreateSpaceVisibilityStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-create-step">
      <fieldset className="form-group space-create-fieldset" disabled={disabled}>
        <legend className="input-label">{t('spaces.create.visibilityLabel')}</legend>
        {SPACE_VISIBILITY_VALUES.map((value) => (
          <label key={value} className="space-create-radio">
            <input
              type="radio"
              name="space-visibility"
              value={value}
              checked={visibility === value}
              onChange={() => onVisibilityChange(value)}
            />
            <span className="space-create-radio-body">
              <span className="space-create-radio-title">
                {t(`spaces.visibility.${value}`)}
              </span>
              <span className="space-create-radio-desc">
                {t(
                  value === 'public'
                    ? 'spaces.create.visibilityPublicDesc'
                    : value === 'listed'
                      ? 'spaces.create.visibilityListedDesc'
                      : 'spaces.create.visibilityHiddenDesc',
                )}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
