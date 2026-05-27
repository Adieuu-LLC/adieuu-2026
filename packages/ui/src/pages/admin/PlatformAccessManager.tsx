import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import {
  createApiClient,
  PLATFORM_ROLE_VALUES,
  PLATFORM_PERMISSION_VALUES,
  type PlatformRole,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../icons/Icon';

export interface PlatformAccessManagerProps {
  identityId: string;
  platformRoles: string[];
  platformAttributes: string[];
  canManageRoles: boolean;
  onRefresh: () => void;
}

const ROLE_LABELS: Record<PlatformRole, string> = {
  admin: 'admin.identities.roles.admin',
  moderator: 'admin.identities.roles.moderator',
  support_agent: 'admin.identities.roles.support_agent',
};

export function PlatformAccessManager({
  identityId,
  platformRoles,
  platformAttributes,
  canManageRoles,
  onRefresh,
}: PlatformAccessManagerProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  return (
    <>
      <RolesSection
        identityId={identityId}
        roles={platformRoles}
        canManage={canManageRoles}
        api={api}
        onRefresh={onRefresh}
        t={t}
      />
      <AttributesSection
        identityId={identityId}
        attributes={platformAttributes}
        canManage={canManageRoles}
        api={api}
        onRefresh={onRefresh}
        t={t}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

interface RolesSectionProps {
  identityId: string;
  roles: string[];
  canManage: boolean;
  api: ReturnType<typeof createApiClient>;
  onRefresh: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function RolesSection({ identityId, roles, canManage, api, onRefresh, t }: RolesSectionProps) {
  const [selectedRole, setSelectedRole] = useState<string[]>([]);
  const [granting, setGranting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableRoles = useMemo(() => {
    const held = new Set(roles);
    return PLATFORM_ROLE_VALUES.filter((r) => !held.has(r));
  }, [roles]);

  const roleCollection = useMemo(
    () =>
      createListCollection({
        items: availableRoles.map((role) => ({
          value: role,
          label: t(ROLE_LABELS[role], role),
        })),
      }),
    [availableRoles, t],
  );

  const handleGrant = useCallback(async () => {
    const role = selectedRole[0] as PlatformRole | undefined;
    if (!role) return;
    setGranting(true);
    setError(null);
    const res = await api.admin.grantPlatformRole(identityId, { role });
    if (!res.success) {
      setError(t('admin.identities.roles.grantError'));
    } else {
      setSelectedRole([]);
      onRefresh();
    }
    setGranting(false);
  }, [api, identityId, selectedRole, onRefresh, t]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setError(null);
    const res = await api.admin.revokePlatformRole(identityId, revokeTarget as PlatformRole);
    if (!res.success) {
      const isLastAdmin = res.error?.message?.toLowerCase().includes('last')
        || res.error?.code === 'VALIDATION_FAILED';
      setError(isLastAdmin
        ? t('admin.identities.roles.lastAdminError')
        : t('admin.identities.roles.revokeError'));
    } else {
      onRefresh();
    }
    setRevoking(false);
    setRevokeTarget(null);
  }, [api, identityId, revokeTarget, onRefresh, t]);

  return (
    <div className="admin-platform-access-section">
      <h4>{t('admin.identities.roles.title')}</h4>

      {roles.length === 0 ? (
        <p className="admin-empty-inline">{t('admin.identities.roles.noRoles')}</p>
      ) : (
        <div className="admin-badge-list">
          {roles.map((role) => (
            <span key={role} className="admin-badge admin-badge--success">
              {t(ROLE_LABELS[role as PlatformRole] ?? role, role)}
              {canManage && (
                <button
                  type="button"
                  className="admin-badge-remove"
                  onClick={() => setRevokeTarget(role)}
                  aria-label={t('admin.identities.roles.revoke')}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canManage && availableRoles.length > 0 && (
        <div className="admin-form-row admin-grant-row">
          <Select.Root
            collection={roleCollection}
            value={selectedRole}
            onValueChange={(details) => setSelectedRole(details.value)}
            disabled={granting}
            positioning={{ sameWidth: true }}
          >
            <Select.Control className="report-select-control">
              <Select.Trigger className="report-select-trigger">
                <Select.ValueText placeholder={t('admin.identities.roles.selectRole')} />
                <Select.Indicator className="report-select-indicator">
                  <Icon name="chevronDown" size="xs" />
                </Select.Indicator>
              </Select.Trigger>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content className="report-select-content">
                  {roleCollection.items.map((item) => (
                    <Select.Item key={item.value} item={item} className="report-select-item">
                      <Select.ItemText>{item.label}</Select.ItemText>
                      <Select.ItemIndicator className="report-select-item-indicator">
                        <Icon name="check" size="xs" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
          <Button
            size="sm"
            onClick={() => void handleGrant()}
            disabled={granting || selectedRole.length === 0}
          >
            {t('admin.identities.roles.grant')}
          </Button>
        </div>
      )}

      {error && <p className="admin-inline-error">{error}</p>}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title={t('admin.identities.roles.revoke')}
        description={t('admin.identities.roles.revokeConfirm', {
          role: t(ROLE_LABELS[revokeTarget as PlatformRole] ?? revokeTarget ?? '', revokeTarget ?? ''),
        })}
        confirmLabel={t('admin.identities.roles.revoke')}
        variant="danger"
        loading={revoking}
        onConfirm={() => void handleRevoke()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attributes (direct permission grants)
// ---------------------------------------------------------------------------

interface AttributesSectionProps {
  identityId: string;
  attributes: string[];
  canManage: boolean;
  api: ReturnType<typeof createApiClient>;
  onRefresh: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function AttributesSection({ identityId, attributes, canManage, api, onRefresh, t }: AttributesSectionProps) {
  const [selectedAttr, setSelectedAttr] = useState<string[]>([]);
  const [granting, setGranting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableAttrs = useMemo(() => {
    const held = new Set(attributes);
    return PLATFORM_PERMISSION_VALUES.filter((a) => !held.has(a));
  }, [attributes]);

  const attrCollection = useMemo(
    () =>
      createListCollection({
        items: availableAttrs.map((attr) => ({
          value: attr,
          label: attr,
        })),
      }),
    [availableAttrs],
  );

  const handleGrant = useCallback(async () => {
    const attribute = selectedAttr[0];
    if (!attribute) return;
    setGranting(true);
    setError(null);
    const res = await api.admin.grantPlatformAttribute(identityId, { attribute });
    if (!res.success) {
      setError(t('admin.identities.attributes.grantError'));
    } else {
      setSelectedAttr([]);
      onRefresh();
    }
    setGranting(false);
  }, [api, identityId, selectedAttr, onRefresh, t]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setError(null);
    const res = await api.admin.revokePlatformAttribute(identityId, revokeTarget);
    if (!res.success) {
      setError(t('admin.identities.attributes.revokeError'));
    } else {
      onRefresh();
    }
    setRevoking(false);
    setRevokeTarget(null);
  }, [api, identityId, revokeTarget, onRefresh, t]);

  return (
    <div className="admin-platform-access-section">
      <h4>{t('admin.identities.attributes.title')}</h4>

      {attributes.length === 0 ? (
        <p className="admin-empty-inline">{t('admin.identities.attributes.noAttributes')}</p>
      ) : (
        <div className="admin-badge-list">
          {attributes.map((attr) => (
            <span key={attr} className="admin-badge admin-badge--info">
              {attr}
              {canManage && (
                <button
                  type="button"
                  className="admin-badge-remove"
                  onClick={() => setRevokeTarget(attr)}
                  aria-label={t('admin.identities.attributes.revoke')}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canManage && availableAttrs.length > 0 && (
        <div className="admin-form-row admin-grant-row">
          <Select.Root
            collection={attrCollection}
            value={selectedAttr}
            onValueChange={(details) => setSelectedAttr(details.value)}
            disabled={granting}
            positioning={{ sameWidth: true }}
          >
            <Select.Control className="report-select-control">
              <Select.Trigger className="report-select-trigger">
                <Select.ValueText placeholder={t('admin.identities.attributes.selectAttribute')} />
                <Select.Indicator className="report-select-indicator">
                  <Icon name="chevronDown" size="xs" />
                </Select.Indicator>
              </Select.Trigger>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content className="report-select-content">
                  {attrCollection.items.map((item) => (
                    <Select.Item key={item.value} item={item} className="report-select-item">
                      <Select.ItemText>{item.label}</Select.ItemText>
                      <Select.ItemIndicator className="report-select-item-indicator">
                        <Icon name="check" size="xs" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
          <Button
            size="sm"
            onClick={() => void handleGrant()}
            disabled={granting || selectedAttr.length === 0}
          >
            {t('admin.identities.attributes.grant')}
          </Button>
        </div>
      )}

      {error && <p className="admin-inline-error">{error}</p>}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title={t('admin.identities.attributes.revoke')}
        description={t('admin.identities.attributes.revokeConfirm', { attribute: revokeTarget ?? '' })}
        confirmLabel={t('admin.identities.attributes.revoke')}
        variant="danger"
        loading={revoking}
        onConfirm={() => void handleRevoke()}
      />
    </div>
  );
}
