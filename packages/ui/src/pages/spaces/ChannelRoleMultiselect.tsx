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
  /** Roles available for picking (usually hierarchy-filtered). */
  roles: readonly PublicSpaceRole[];
  /**
   * Full role list for resolving selected chips (e.g. inherited parent roles
   * that may sit above the actor in hierarchy).
   */
  catalogRoles?: readonly PublicSpaceRole[];
  selectedRoleIds: ReadonlySet<string>;
  onToggle: (roleId: string) => void;
  spaceCipher: CommunityCipher | null;
  disabled?: boolean;
  loading?: boolean;
  inheritFromParent?: boolean;
  onInheritFromParentChange?: (value: boolean) => void;
  /** When set, inherit is locked and editors stay disabled. */
  forcedByName?: string | null;
}

export function ChannelRoleMultiselect({
  roles,
  catalogRoles,
  selectedRoleIds,
  onToggle,
  spaceCipher,
  disabled = false,
  loading = false,
  inheritFromParent = false,
  onInheritFromParentChange,
  forcedByName = null,
}: ChannelRoleMultiselectProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const encryptedRolePlaceholder = t('spaces.encryptedRolePlaceholder');
  const forced = !!forcedByName;
  const editorsDisabled = disabled || loading || inheritFromParent || forced;
  const roleCatalog = catalogRoles ?? roles;

  const roleLabel = (role: PublicSpaceRole) =>
    resolveRoleDisplayName(role, spaceCipher, {
      encryptedRole: encryptedRolePlaceholder,
    });

  const selectedRoles = useMemo(() => {
    const byId = new Map(roleCatalog.map((r) => [r.id, r]));
    const resolved: PublicSpaceRole[] = [];
    for (const id of selectedRoleIds) {
      const role = byId.get(id);
      if (role) resolved.push(role);
    }
    return resolved;
  }, [roleCatalog, selectedRoleIds]);

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

      {onInheritFromParentChange && (
        <label className="create-channel-inherit">
          <input
            type="checkbox"
            checked={inheritFromParent || forced}
            onChange={(e) => onInheritFromParentChange(e.target.checked)}
            disabled={disabled || loading || forced}
          />
          <span className="create-channel-encrypt-body">
            <span className="create-channel-field-label">
              {t('spaces.createChannel.inheritRolesLabel')}
            </span>
            <span className="create-channel-field-hint">
              {forced
                ? t('spaces.createChannel.inheritRolesForced', { name: forcedByName })
                : t('spaces.createChannel.inheritRolesHint')}
            </span>
          </span>
        </label>
      )}

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
                    {!editorsDisabled && (
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

      {!editorsDisabled && (
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
      )}
    </fieldset>
  );
}
