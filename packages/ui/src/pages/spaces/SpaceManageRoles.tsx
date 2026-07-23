/**
 * Space Manage → Roles: sticky role list + selected role editor
 * (Settings / Permissions / Manage Members), similar to Appearance settings.
 */

import {
  createApiClient,
  DEFAULT_CUSTOM_ROLE_COLOR,
  type PublicSpaceRole,
  type SpacePermission,
} from '@adieuu/shared';
import { createListCollection, Portal, Select } from '@ark-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { TabContent, TabList, Tabs, TabTrigger } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';
import { SpaceRoleDisplayTab } from './SpaceRoleDisplayTab';
import { SpaceRoleMembersTab } from './SpaceRoleMembersTab';
import { SpaceRolePermissionsTab } from './SpaceRolePermissionsTab';
import { resolveRoleDisplayName } from './spaceMetadataCipher';
import { useSpaceCipher } from './useSpaceCipher';

const VALID_TABS = ['settings', 'permissions', 'members'] as const;
type RoleTab = (typeof VALID_TABS)[number];

function normalizeRoleTab(raw: string | undefined): RoleTab {
  if (raw === 'display') return 'settings';
  if (VALID_TABS.includes(raw as RoleTab)) return raw as RoleTab;
  return 'settings';
}

export function SpaceManageRoles() {
  const { t } = useTranslation();
  const { slug, roleId, tab: tabParam } = useParams<{
    slug: string;
    roleId?: string;
    tab?: string;
  }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const {
    activeSpace,
    hasActiveSpacePermission,
    rolePermissionPreview,
    setRolePermissionPreview,
  } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);

  const [roles, setRoles] = useState<PublicSpaceRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicSpaceRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = hasActiveSpacePermission('manageRoles');
  const activeTab = normalizeRoleTab(tabParam);

  const resolveRoleName = useCallback(
    (role: PublicSpaceRole) =>
      resolveRoleDisplayName(role, spaceCipher, {
        encryptedRole: t('spaces.encryptedRolePlaceholder'),
      }),
    [spaceCipher, t],
  );

  const load = useCallback(async () => {
    if (!activeSpace) return;
    setLoading(true);
    const res = await api.spaces.listRoles(activeSpace.id);
    if (res.success && res.data) {
      setRoles([...res.data.roles].sort((a, b) => a.position - b.position));
    } else {
      toast.error(t('spaces.manage.roles.loadError'));
    }
    setLoading(false);
  }, [activeSpace, api, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = useMemo(
    () => (roleId ? roles.find((r) => r.id === roleId) ?? null : null),
    [roleId, roles],
  );

  // Default to the first role when landing on /manage/roles.
  useEffect(() => {
    if (loading || !slug || roleId || roles.length === 0) return;
    navigate(`/s/${slug}/manage/roles/${roles[0]!.id}/settings`, { replace: true });
  }, [loading, slug, roleId, roles, navigate]);

  // Legacy /display tab URL → /settings.
  useEffect(() => {
    if (!slug || !roleId || tabParam !== 'display') return;
    navigate(`/s/${slug}/manage/roles/${roleId}/settings`, { replace: true });
  }, [slug, roleId, tabParam, navigate]);

  // Everyone has no Manage Members tab (every member holds it).
  useEffect(() => {
    if (!slug || !roleId || !selectedRole || selectedRole.systemKey !== 'member') return;
    if (activeTab !== 'members') return;
    navigate(`/s/${slug}/manage/roles/${roleId}/settings`, { replace: true });
  }, [slug, roleId, selectedRole, activeTab, navigate]);

  if (!canManage) {
    return <Navigate to={`/s/${slug ?? activeSpace?.slug}/manage`} replace />;
  }

  const roleBase = (id: string) => `/s/${slug}/manage/roles/${id}`;

  const selectRole = (id: string) => {
    const next = roles.find((r) => r.id === id);
    const tab =
      next?.systemKey === 'member' && activeTab === 'members' ? 'settings' : activeTab;
    navigate(`${roleBase(id)}/${tab}`, { replace: true });
  };

  const handleTabChange = (next: string) => {
    if (!roleId || !VALID_TABS.includes(next as RoleTab)) return;
    navigate(`${roleBase(roleId)}/${next}`, { replace: true });
  };

  const handleCreate = async () => {
    if (!activeSpace) return;
    setCreating(true);
    const res = await api.spaces.createRole(activeSpace.id, {
      name: t('spaces.manage.roles.newRoleName'),
      color: DEFAULT_CUSTOM_ROLE_COLOR,
      permissions: [],
    });
    setCreating(false);
    if (res.success && res.data?.role) {
      toast.success(t('spaces.manage.roles.createSuccess'));
      await load();
      navigate(`${roleBase(res.data.role.id)}/settings`);
    } else {
      toast.error(t('spaces.manage.roles.createError'));
    }
  };

  const handleDelete = async () => {
    if (!activeSpace || !deleteTarget) return;
    setDeleting(true);
    const res = await api.spaces.deleteRole(activeSpace.id, deleteTarget.id);
    setDeleting(false);
    if (res.success) {
      toast.success(t('spaces.manage.roles.deleteSuccess'));
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      if (rolePermissionPreview?.roleId === deletedId) {
        setRolePermissionPreview(null);
      }
      const remaining = roles.filter((r) => r.id !== deletedId);
      setRoles(remaining);
      if (roleId === deletedId) {
        if (remaining[0]) {
          navigate(`${roleBase(remaining[0].id)}/${activeTab}`, { replace: true });
        } else {
          navigate(`/s/${slug}/manage/roles`, { replace: true });
        }
      }
    } else {
      const code = res.error?.code;
      toast.error(
        code === 'ROLE_IN_USE'
          ? t('spaces.manage.roles.deleteInUseError')
          : t('spaces.manage.roles.deleteError'),
      );
    }
  };

  const patchRole = async (patch: {
    name?: string;
    permissions?: SpacePermission[];
    color?: string;
    displaySeparately?: boolean;
    mentionable?: boolean;
    isDefaultMember?: boolean;
  }) => {
    if (!activeSpace || !selectedRole) return false;
    setSaving(true);
    const res = await api.spaces.updateRole(activeSpace.id, selectedRole.id, patch);
    setSaving(false);
    if (res.success && res.data?.role) {
      const updated = res.data.role;
      setRoles((prev) =>
        prev.map((r) => {
          if (r.id === updated.id) return updated;
          // Making this role default clears the flag on every other role.
          if (updated.isDefaultMember && r.isDefaultMember) {
            return { ...r, isDefaultMember: false };
          }
          return r;
        }),
      );
      if (rolePermissionPreview?.roleId === updated.id) {
        setRolePermissionPreview({
          roleId: updated.id,
          permissions: updated.permissions,
        });
      }
      return true;
    }
    toast.error(t('spaces.manage.roles.saveError'));
    return false;
  };

  const previewActive =
    !!selectedRole && rolePermissionPreview?.roleId === selectedRole.id;

  const roleCollection = useMemo(
    () =>
      createListCollection({
        items: roles.map((role) => ({
          value: role.id,
          label: resolveRoleName(role),
        })),
      }),
    [roles, resolveRoleName],
  );

  const selectedRoleLabel = selectedRole ? resolveRoleName(selectedRole) : '';

  const renderCreateButton = () => (
    <Button
      variant="primary"
      size="sm"
      className="space-manage-roles-create"
      onClick={() => void handleCreate()}
      disabled={creating}
    >
      {creating ? t('spaces.manage.roles.creating') : t('spaces.manage.roles.create')}
    </Button>
  );

  return (
    <div className="page-content space-manage-page admin-page space-manage-roles-page">
      <header className="page-header">
        <h1 className="page-title">{t('spaces.manage.roles.title')}</h1>
        <p className="page-subtitle">{t('spaces.manage.roles.subtitle')}</p>
      </header>

      {loading ? (
        <div className="admin-loading" role="status" aria-label={t('common.loading')}>
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-manage-roles-layout">
          <nav
            className="space-manage-roles-nav"
            aria-label={t('spaces.manage.roles.title')}
          >
            {renderCreateButton()}
            <ul className="space-manage-roles-nav-list">
              {roles.map((role) => {
                const active = role.id === selectedRole?.id;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      className={`space-manage-roles-nav-btn${active ? ' space-manage-roles-nav-btn--active' : ''}`}
                      onClick={() => selectRole(role.id)}
                    >
                      <span
                        className="space-manage-role-swatch"
                        style={{ backgroundColor: role.color }}
                        aria-hidden
                      />
                      <span className="space-manage-role-name">{resolveRoleName(role)}</span>
                      {role.isSystem && (
                        <span className="space-manage-role-badge">
                          {t('spaces.manage.roles.systemBadge')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-manage-roles-select-wrapper">
            {renderCreateButton()}
            <Select.Root
              collection={roleCollection}
              value={selectedRole ? [selectedRole.id] : []}
              onValueChange={(details) => {
                const next = details.value[0];
                if (next) selectRole(next);
              }}
              positioning={{ sameWidth: true }}
            >
              <Select.Control className="space-manage-roles-select-control">
                <Select.Trigger
                  className="space-manage-roles-select-trigger"
                  aria-label={t('spaces.manage.roles.selectRole')}
                >
                  <Select.ValueText placeholder={t('spaces.manage.roles.selectRole')}>
                    {selectedRoleLabel}
                  </Select.ValueText>
                  <Select.Indicator className="space-manage-roles-select-indicator">
                    <Icon name="chevronDown" size="xs" />
                  </Select.Indicator>
                </Select.Trigger>
              </Select.Control>

              <Portal>
                <Select.Positioner>
                  <Select.Content className="space-manage-roles-select-content">
                    {roleCollection.items.map((item) => (
                      <Select.Item
                        key={item.value}
                        item={item}
                        className="space-manage-roles-select-item"
                      >
                        <Select.ItemText>{item.label}</Select.ItemText>
                        <Select.ItemIndicator className="space-manage-roles-select-check">
                          <Icon name="check" size="xs" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>

          <div className="space-manage-roles-editor">
            {!selectedRole ? (
              <p className="space-manage-empty">{t('spaces.manage.roles.emptyEditor')}</p>
            ) : (
              <>
                <header className="space-manage-role-header">
                  <h2 className="space-manage-role-editor-title">
                    <span
                      className="space-manage-role-swatch space-manage-role-swatch--lg"
                      style={{ backgroundColor: selectedRole.color }}
                      aria-hidden
                    />
                    {resolveRoleName(selectedRole)}
                  </h2>
                  <div className="space-manage-role-header-actions">
                    {previewActive && (
                      <div className="space-manage-preview-banner" role="status">
                        <span>{t('spaces.manage.roles.previewActive')}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setRolePermissionPreview(null)}
                        >
                          {t('spaces.manage.roles.exitPreview')}
                        </Button>
                      </div>
                    )}
                    {!selectedRole.isSystem && !selectedRole.systemKey && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(selectedRole)}
                      >
                        {t('spaces.manage.roles.delete')}
                      </Button>
                    )}
                  </div>
                </header>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabList
                    mobileItems={(selectedRole.systemKey === 'member'
                      ? (['settings', 'permissions'] as const)
                      : VALID_TABS
                    ).map((value) => ({
                      value,
                      label: t(`spaces.manage.roles.tabs.${value}` as never),
                    }))}
                  >
                    {(selectedRole.systemKey === 'member'
                      ? (['settings', 'permissions'] as const)
                      : VALID_TABS
                    ).map((value) => (
                      <TabTrigger key={value} value={value}>
                        {t(`spaces.manage.roles.tabs.${value}` as never)}
                      </TabTrigger>
                    ))}
                  </TabList>

                  <TabContent value="settings" className="space-manage-role-tabpanel">
                    <SpaceRoleDisplayTab
                      role={selectedRole}
                      saving={saving}
                      previewActive={previewActive}
                      onSave={(patch) => patchRole(patch)}
                      onPreview={() =>
                        setRolePermissionPreview({
                          roleId: selectedRole.id,
                          permissions: selectedRole.permissions,
                        })
                      }
                      onExitPreview={() => setRolePermissionPreview(null)}
                    />
                  </TabContent>

                  <TabContent value="permissions" className="space-manage-role-tabpanel">
                    <SpaceRolePermissionsTab
                      role={selectedRole}
                      saving={saving}
                      onSave={(permissions) => patchRole({ permissions })}
                    />
                  </TabContent>

                  {selectedRole.systemKey !== 'member' && (
                    <TabContent value="members" className="space-manage-role-tabpanel">
                      <SpaceRoleMembersTab role={selectedRole} allRoles={roles} />
                    </TabContent>
                  )}
                </Tabs>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('spaces.manage.roles.deleteConfirmTitle')}
        description={t('spaces.manage.roles.deleteConfirmBody', {
          name: deleteTarget ? resolveRoleName(deleteTarget) : '',
        })}
        confirmLabel={t('spaces.manage.roles.delete')}
        onConfirm={() => void handleDelete()}
        loading={deleting}
        variant="danger"
      />
    </div>
  );
}
