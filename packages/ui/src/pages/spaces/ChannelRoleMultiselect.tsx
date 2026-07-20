/**
 * Dialog-safe role multiselect for channel create/edit.
 * Inline search + chips (no portaled Combobox/Popover) so Ark Dialog focus trap works.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommunityCipher } from '@adieuu/crypto';
import type { PublicSpaceRole } from '@adieuu/shared';
import { Icon } from '../../icons/Icon';
import { resolveRoleDisplayName } from './spaceMetadataCipher';

export interface ChannelRoleMultiselectProps {
  roles: readonly PublicSpaceRole[];
  selectedRoleIds: ReadonlySet<string>;
  onToggle: (roleId: string) => void;
  spaceCipher: CommunityCipher | null;
  disabled?: boolean;
  loading?: boolean;
}

export function ChannelRoleMultiselect({
  roles,
  selectedRoleIds,
  onToggle,
  spaceCipher,
  disabled = false,
  loading = false,
}: ChannelRoleMultiselectProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const encryptedRolePlaceholder = t('spaces.encryptedRolePlaceholder');

  const roleLabel = (role: PublicSpaceRole) =>
    resolveRoleDisplayName(role, spaceCipher, {
      encryptedRole: encryptedRolePlaceholder,
    });

  const selectedRoles = useMemo(
    () => roles.filter((r) => selectedRoleIds.has(r.id)),
    [roles, selectedRoleIds],
  );

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...roles];
    return roles.filter((role) =>
      resolveRoleDisplayName(role, spaceCipher, {
        encryptedRole: encryptedRolePlaceholder,
      })
        .toLowerCase()
        .includes(q),
    );
  }, [roles, query, spaceCipher, encryptedRolePlaceholder]);

  return (
    <fieldset className="create-channel-roles" disabled={disabled || loading}>
      <legend className="create-channel-field-label">
        {t('spaces.createChannel.rolesLabel')}
      </legend>
      <p className="create-channel-field-hint">{t('spaces.createChannel.rolesHint')}</p>

      <div className="create-channel-role-selected" aria-live="polite">
        {selectedRoles.length === 0 ? (
          <p className="create-channel-role-none">
            {loading
              ? t('spaces.createChannel.rolesLoading')
              : t('spaces.createChannel.rolesNoneSelected')}
          </p>
        ) : (
          <ul className="create-channel-role-chips">
            {selectedRoles.map((role) => {
              const label = roleLabel(role);
              return (
                <li key={role.id}>
                  <span
                    className="create-channel-role-chip"
                    style={{ ['--role-color' as string]: role.color }}
                  >
                    <span className="create-channel-role-chip-label">{label}</span>
                    {!disabled && !loading && (
                      <button
                        type="button"
                        className="create-channel-role-chip-remove"
                        aria-label={t('spaces.createChannel.rolesRemove', { name: label })}
                        onClick={() => onToggle(role.id)}
                      >
                        <Icon name="x" size="xs" />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="create-channel-role-picker">
        <div className="create-channel-role-search-row">
          <span className="create-channel-role-search-icon" aria-hidden>
            <Icon name="search" size="xs" />
          </span>
          <input
            type="search"
            className="create-channel-role-search-input"
            placeholder={t('spaces.createChannel.rolesSearchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('spaces.createChannel.rolesSearchPlaceholder')}
            autoComplete="off"
            disabled={disabled || loading}
          />
        </div>

        <ul
          className="create-channel-role-list"
          role="listbox"
          aria-multiselectable
          aria-label={t('spaces.createChannel.rolesLabel')}
        >
          {filteredRoles.length === 0 ? (
            <li className="create-channel-role-empty" role="presentation">
              {roles.length === 0
                ? t('spaces.createChannel.rolesEmpty')
                : t('spaces.createChannel.rolesNoMatch')}
            </li>
          ) : (
            filteredRoles.map((role) => {
              const label = roleLabel(role);
              const isSelected = selectedRoleIds.has(role.id);
              return (
                <li key={role.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`create-channel-role-option${isSelected ? ' create-channel-role-option--selected' : ''}`}
                    disabled={disabled || loading}
                    onClick={() => onToggle(role.id)}
                  >
                    <span
                      className="create-channel-role-swatch"
                      style={{ backgroundColor: role.color }}
                      aria-hidden
                    />
                    <span className="create-channel-role-option-label">{label}</span>
                    {isSelected && (
                      <span className="create-channel-role-option-check" aria-hidden>
                        <Icon name="check" size="xs" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </fieldset>
  );
}
