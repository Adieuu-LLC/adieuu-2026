/**
 * Role Permissions tab: collapsible categories with SegmentGroup toggles.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SPACE_PERMISSION_CATEGORIES,
  SPACE_PERMISSION_DEFS,
  applySpacePermissionToggle,
  getSpacePermissionToggleValue,
  type PublicSpaceRole,
  type SpacePermission,
  type SpacePermissionCategory,
  type SpacePermissionToggleValue,
} from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../icons/Icon';
import { SpaceRolePermissionToggle } from './SpaceRolePermissionToggle';

interface SpaceRolePermissionsTabProps {
  role: PublicSpaceRole;
  saving: boolean;
  onSave: (permissions: SpacePermission[]) => Promise<boolean>;
}

export function SpaceRolePermissionsTab({
  role,
  saving,
  onSave,
}: SpaceRolePermissionsTabProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<SpacePermission[]>(role.permissions);
  const [expanded, setExpanded] = useState<Record<SpacePermissionCategory, boolean>>(() =>
    Object.fromEntries(SPACE_PERMISSION_CATEGORIES.map((c) => [c, true])) as Record<
      SpacePermissionCategory,
      boolean
    >,
  );

  useEffect(() => {
    setPermissions(role.permissions);
  }, [role]);

  const dirty = useMemo(() => {
    if (permissions.length !== role.permissions.length) return true;
    const set = new Set(role.permissions);
    return permissions.some((p) => !set.has(p));
  }, [permissions, role.permissions]);

  const byCategory = useMemo(() => {
    const map = new Map<SpacePermissionCategory, typeof SPACE_PERMISSION_DEFS>();
    for (const cat of SPACE_PERMISSION_CATEGORIES) {
      map.set(
        cat,
        SPACE_PERMISSION_DEFS.filter((d) => d.category === cat),
      );
    }
    return map;
  }, []);

  const handleToggle = (defId: string, value: SpacePermissionToggleValue) => {
    const def = SPACE_PERMISSION_DEFS.find((d) => d.id === defId);
    if (!def) return;
    setPermissions(applySpacePermissionToggle(permissions, def, value));
  };

  return (
    <div className="space-role-permissions">
      <div className="space-role-display-actions">
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void onSave(permissions)}
        >
          {saving ? t('spaces.manage.roles.saving') : t('spaces.manage.roles.save')}
        </Button>
      </div>

      {SPACE_PERMISSION_CATEGORIES.map((category) => {
        const defs = byCategory.get(category) ?? [];
        const isOpen = expanded[category];
        return (
          <Card key={category} className="admin-card space-role-category-card">
            <button
              type="button"
              className="space-role-category-toggle"
              aria-expanded={isOpen}
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
              }
            >
              <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size="sm" />
              <span>{t(`spaces.permissions.categories.${category}` as never)}</span>
              <span className="space-role-category-count">
                {defs.length === 0
                  ? t('spaces.permissions.categories.empty')
                  : t('spaces.permissions.categories.count', { count: defs.length })}
              </span>
            </button>
            {isOpen && (
              <div className="space-role-category-body">
                {defs.length === 0 ? (
                  <p className="space-manage-empty">
                    {t('spaces.permissions.categories.comingSoon')}
                  </p>
                ) : (
                  defs.map((def) => (
                    <SpaceRolePermissionToggle
                      key={def.id}
                      def={def}
                      value={getSpacePermissionToggleValue(def, permissions)}
                      onChange={(value) => handleToggle(def.id, value)}
                      disabled={saving}
                    />
                  ))
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
