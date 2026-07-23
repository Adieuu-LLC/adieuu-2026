/**
 * Right-click moderation menu for Space members: kick, ban, and role assignment.
 */

import {
  canGrantSpaceMemberRole,
  type PublicSpaceMember,
  type PublicSpaceRole,
  type SpaceBanDuration,
  type SpacePermission,
} from '@adieuu/shared';
import { Menu, Portal, Switch } from '@ark-ui/react';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';

const BAN_DURATIONS: SpaceBanDuration[] = ['1h', '1d', '7d', '30d', 'permanent'];

export interface SpaceMemberModerationMenuProps {
  member: PublicSpaceMember;
  roles: PublicSpaceRole[];
  /** Used to detect sole-Admin lock when removing the Admin system role. */
  spaceMembers?: readonly PublicSpaceMember[];
  actorPermissions: readonly SpacePermission[];
  ownerIdentityId: string | undefined;
  selfId: string | undefined;
  canKick: boolean;
  canBan: boolean;
  canManageMemberRoles: boolean;
  /** When true, may assign any role except system Admin (unless actorIsAdmin). */
  canManageRoles: boolean;
  /** Actor holds the system Admin role. */
  actorIsAdmin: boolean;
  resolveRoleName: (role: PublicSpaceRole) => string;
  removeMember: (identityId: string) => Promise<{ success: boolean; error?: string | { message?: string } }>;
  banMember: (
    identityId: string,
    body: { reason: string; duration: SpaceBanDuration },
  ) => Promise<{ success: boolean; error?: string | { message?: string } }>;
  setMemberRoles: (
    identityId: string,
    roleIds: string[],
  ) => Promise<{ success: boolean; data?: { member: PublicSpaceMember }; error?: string | { message?: string } }>;
  onMemberUpdated: (member: PublicSpaceMember) => void;
  onMemberRemoved: (identityId: string) => void;
  /** When set, shows Nickname & Color and invokes this on select. */
  onEditNicknameColor?: () => void;
  /** Extra class on the context-trigger wrapper (e.g. inline for message authors). */
  className?: string;
  /** Called when the context menu opens (e.g. to dismiss a profile card first). */
  onMenuOpen?: () => void;
  children: ReactElement;
}

function errorMessage(error: string | { message?: string } | undefined): string | undefined {
  if (!error) return undefined;
  return typeof error === 'string' ? error : error.message;
}

export function SpaceMemberModerationMenu({
  member,
  roles,
  spaceMembers,
  actorPermissions,
  ownerIdentityId,
  selfId,
  canKick,
  canBan,
  canManageMemberRoles,
  canManageRoles,
  actorIsAdmin,
  resolveRoleName,
  removeMember,
  banMember,
  setMemberRoles,
  onMemberUpdated,
  onMemberRemoved,
  onEditNicknameColor,
  className,
  onMenuOpen,
  children,
}: SpaceMemberModerationMenuProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [kickOpen, setKickOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [kickReason, setKickReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<SpaceBanDuration>('1d');
  const [busy, setBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rolesMenuOpen, setRolesMenuOpen] = useState(false);
  const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | undefined>();
  /** Block pointer hits on content until the opening right-click is fully released. */
  const [blockContentPointer, setBlockContentPointer] = useState(false);
  const unlockTimerRef = useRef<number | null>(null);
  const armPointerBlockRef = useRef(false);

  const isSelf = member.identityId === selfId;
  const isOwner = ownerIdentityId != null && member.identityId === ownerIdentityId;
  const showKick = canKick && !isSelf && !isOwner;
  const showBan = canBan && !isSelf && !isOwner;
  const showRoles = canManageMemberRoles || canManageRoles;
  const showEditNicknameColor = !!onEditNicknameColor;
  const hasMenu = showKick || showBan || showRoles || showEditNicknameColor;

  /** Every space role except Everyone (always held; not toggled here). */
  const manageableRoles = useMemo(() => {
    return roles
      .filter((role) => !role.isDefaultMember && role.systemKey !== 'everyone')
      .slice()
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }, [roles]);

  const canGrantRole = useCallback(
    (role: PublicSpaceRole) =>
      canGrantSpaceMemberRole({
        role,
        actorPermissions,
        actorIsAdmin,
        actorCanManageRoles: canManageRoles,
      }),
    [actorPermissions, actorIsAdmin, canManageRoles],
  );

  const defaultMemberRoleId = useMemo(
    () => roles.find((r) => r.isDefaultMember || r.systemKey === 'everyone')?.id,
    [roles],
  );

  const adminRoleId = useMemo(
    () => roles.find((r) => r.systemKey === 'admin')?.id,
    [roles],
  );

  const adminMemberCount = useMemo(() => {
    if (!adminRoleId) return 0;
    if (spaceMembers && spaceMembers.length > 0) {
      return spaceMembers.filter((m) => m.roleIds.includes(adminRoleId)).length;
    }
    return member.roleIds.includes(adminRoleId) ? 1 : 0;
  }, [adminRoleId, spaceMembers, member.roleIds]);

  /** Sole Admin cannot remove their own Admin system role. */
  const isAdminRoleLocked = useCallback(
    (role: PublicSpaceRole) => {
      if (role.systemKey !== 'admin' || !adminRoleId) return false;
      if (!member.roleIds.includes(adminRoleId)) return false;
      return adminMemberCount <= 1;
    },
    [adminRoleId, member.roleIds, adminMemberCount],
  );

  const handleKick = useCallback(async () => {
    if (!kickReason.trim()) return;
    setBusy(true);
    const res = await removeMember(member.identityId);
    setBusy(false);
    if (!res.success) {
      toast.error(errorMessage(res.error) ?? t('spaces.members.kickFailed', 'Could not kick member.'));
      return;
    }
    onMemberRemoved(member.identityId);
    setKickOpen(false);
    setKickReason('');
  }, [kickReason, removeMember, member.identityId, onMemberRemoved, toast, t]);

  const handleBan = useCallback(async () => {
    if (!banReason.trim()) return;
    setBusy(true);
    const res = await banMember(member.identityId, {
      reason: banReason.trim(),
      duration: banDuration,
    });
    setBusy(false);
    if (!res.success) {
      toast.error(errorMessage(res.error) ?? t('spaces.members.banFailed', 'Could not ban member.'));
      return;
    }
    onMemberRemoved(member.identityId);
    setBanOpen(false);
    setBanReason('');
    setBanDuration('1d');
  }, [banReason, banDuration, banMember, member.identityId, onMemberRemoved, toast, t]);

  const toggleRole = useCallback(
    async (roleId: string, checked: boolean) => {
      const held = new Set(member.roleIds);
      if (checked) held.add(roleId);
      else held.delete(roleId);
      if (defaultMemberRoleId) held.add(defaultMemberRoleId);
      const next = [...held];
      setRoleBusyId(roleId);
      const res = await setMemberRoles(member.identityId, next);
      setRoleBusyId(null);
      if (!res.success || !res.data?.member) {
        toast.error(
          errorMessage(res.error) ?? t('spaces.members.rolesUpdateFailed', 'Could not update roles.'),
        );
        return;
      }
      onMemberUpdated(res.data.member);
    },
    [member.roleIds, member.identityId, defaultMemberRoleId, setMemberRoles, onMemberUpdated, toast, t],
  );

  const clearUnlockTimer = useCallback(() => {
    if (unlockTimerRef.current != null) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
  }, []);

  const handleMenuOpenChange = useCallback(
    (details: { open: boolean }) => {
      setMenuOpen(details.open);
      if (!details.open) {
        setRolesMenuOpen(false);
        setAnchorPoint(undefined);
        armPointerBlockRef.current = false;
      }
      clearUnlockTimer();
      if (details.open) {
        onMenuOpen?.();
        if (armPointerBlockRef.current) {
          setBlockContentPointer(true);
          const unlock = () => {
            setBlockContentPointer(false);
            armPointerBlockRef.current = false;
            window.removeEventListener('pointerup', unlock, true);
            window.removeEventListener('pointercancel', unlock, true);
            clearUnlockTimer();
          };
          window.addEventListener('pointerup', unlock, true);
          window.addEventListener('pointercancel', unlock, true);
          // Fallback if pointerup never arrives (e.g. OS context-menu quirks).
          unlockTimerRef.current = window.setTimeout(unlock, 400);
        } else {
          setBlockContentPointer(false);
        }
      } else {
        setBlockContentPointer(false);
      }
    },
    [clearUnlockTimer, onMenuOpen],
  );

  const openRolesMenu = useCallback(() => {
    setRolesMenuOpen(true);
  }, []);

  useEffect(() => () => clearUnlockTimer(), [clearUnlockTimer]);

  if (!hasMenu) return children;

  const triggerClass = className
    ? `space-member-moderation-trigger ${className}`
    : 'space-member-moderation-trigger';

  const showModerationSeparator =
    showEditNicknameColor && (showKick || showBan || (showRoles && manageableRoles.length > 0));

  return (
    <>
      <Menu.Root
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        anchorPoint={anchorPoint}
        positioning={{ gutter: 4 }}
        // Profile / hover cards share the dismissable-layer stack; without this,
        // their teardown also closes the menu.
        onRequestDismiss={(e) => e.preventDefault()}
      >
        <Menu.ContextTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation so nested message menus do not also open */}
          <div
            className={triggerClass}
            data-skip-app-plain-context
            onContextMenu={(e) => {
              e.stopPropagation();
              armPointerBlockRef.current = true;
              setAnchorPoint({ x: e.clientX, y: e.clientY });
            }}
          >
            {children}
          </div>
        </Menu.ContextTrigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content
              className="conversation-context-menu space-member-moderation-menu"
              style={blockContentPointer ? { pointerEvents: 'none' } : undefined}
            >
              {showEditNicknameColor && (
                <Menu.Item
                  value="nickname-color"
                  className="conversation-context-menu-item"
                  onPointerEnter={() => setRolesMenuOpen(false)}
                  onSelect={() => onEditNicknameColor?.()}
                >
                  <Icon name="pen" className="conversation-context-menu-item-icon" />
                  {t('spaces.members.nicknameAndColor', 'Nickname & Color')}
                </Menu.Item>
              )}
              {showModerationSeparator && (
                <Menu.Separator className="conversation-context-menu-separator" />
              )}
              {showKick && (
                <Menu.Item
                  value="kick"
                  className="conversation-context-menu-item conversation-context-menu-item--danger"
                  onPointerEnter={() => setRolesMenuOpen(false)}
                  onSelect={() => {
                    setKickReason('');
                    setKickOpen(true);
                  }}
                >
                  <Icon name="x" className="conversation-context-menu-item-icon" />
                  {t('spaces.members.kick', 'Kick')}
                </Menu.Item>
              )}
              {showBan && (
                <Menu.Item
                  value="ban"
                  className="conversation-context-menu-item conversation-context-menu-item--danger"
                  onPointerEnter={() => setRolesMenuOpen(false)}
                  onSelect={() => {
                    setBanReason('');
                    setBanDuration('1d');
                    setBanOpen(true);
                  }}
                >
                  <Icon name="shield" className="conversation-context-menu-item-icon" />
                  {t('spaces.members.ban', 'Ban')}
                </Menu.Item>
              )}
              {showRoles && manageableRoles.length > 0 && (
                <Menu.Root
                  open={rolesMenuOpen}
                  onOpenChange={(d) => setRolesMenuOpen(d.open)}
                  positioning={{ placement: 'right-start', gutter: 0, overlap: true }}
                  onRequestDismiss={(e) => e.preventDefault()}
                >
                  <Menu.TriggerItem
                    className="conversation-context-menu-item"
                    // Explicit hover-open: Zag only auto-opens on pointermove when the
                    // nested menu is wired as a submenu; click still worked without that.
                    onPointerEnter={openRolesMenu}
                    onPointerMove={openRolesMenu}
                  >
                    <Icon name="users" className="conversation-context-menu-item-icon" />
                    {t('spaces.members.updateRoles', 'Update roles')}
                    <Icon name="chevronRight" className="conversation-context-menu-item-chevron" />
                  </Menu.TriggerItem>
                  <Portal>
                    <Menu.Positioner className="space-member-roles-submenu-positioner">
                      <Menu.Content
                        className="conversation-context-menu space-member-roles-submenu"
                        onPointerEnter={openRolesMenu}
                      >
                        {manageableRoles.map((role) => {
                          const checked = member.roleIds.includes(role.id);
                          const busyRole = roleBusyId === role.id;
                          const adminLocked = isAdminRoleLocked(role);
                          // May always remove (unless sole Admin); may only add when grantable.
                          const escalationLocked = !checked && !canGrantRole(role);
                          const locked = adminLocked || escalationLocked;
                          const disabled = busyRole || locked;
                          const switchEl = (
                            <Switch.Root
                              checked={checked}
                              disabled={disabled}
                              className={
                                locked
                                  ? 'sidebar-filter-switch space-member-roles-switch space-member-roles-switch--locked'
                                  : 'sidebar-filter-switch space-member-roles-switch'
                              }
                              onPointerDown={(e) => e.stopPropagation()}
                              onCheckedChange={(d) => {
                                if (adminLocked && !d.checked) return;
                                if (escalationLocked && d.checked) return;
                                void toggleRole(role.id, d.checked);
                              }}
                            >
                              <Switch.Label className="sidebar-filter-switch-label space-member-roles-switch-label">
                                <span
                                  className="space-member-roles-swatch"
                                  style={{ background: role.color }}
                                  aria-hidden
                                />
                                {resolveRoleName(role)}
                              </Switch.Label>
                              <Switch.Control className="sidebar-filter-switch-control">
                                <Switch.Thumb className="sidebar-filter-switch-thumb" />
                              </Switch.Control>
                              <Switch.HiddenInput />
                            </Switch.Root>
                          );
                          const lockTooltip = adminLocked
                            ? t(
                                'spaces.members.lastAdminRoleLocked',
                                'You cannot remove the Admin role while you are the only admin.',
                              )
                            : escalationLocked
                              ? role.systemKey === 'admin'
                                ? t(
                                    'spaces.members.adminRoleAssignLocked',
                                    'Only system admins can assign the Admin role.',
                                  )
                                : t(
                                    'spaces.members.roleEscalationLocked',
                                    'You cannot assign a role with permissions you do not hold.',
                                  )
                              : null;
                          return (
                            <div
                              key={role.id}
                              className={
                                locked
                                  ? 'space-member-roles-row space-member-roles-row--locked'
                                  : 'space-member-roles-row'
                              }
                            >
                              {lockTooltip ? (
                                <Tooltip content={lockTooltip} position="left">
                                  <div className="space-member-roles-locked-wrap">{switchEl}</div>
                                </Tooltip>
                              ) : (
                                switchEl
                              )}
                            </div>
                          );
                        })}
                      </Menu.Content>
                    </Menu.Positioner>
                  </Portal>
                </Menu.Root>
              )}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      <ConfirmDialog
        open={kickOpen}
        onOpenChange={setKickOpen}
        title={t('spaces.members.kickTitle', 'Kick member?')}
        variant="danger"
        confirmLabel={t('spaces.members.kickConfirm', 'Kick')}
        loading={busy}
        confirmDisabled={!kickReason.trim()}
        onConfirm={() => void handleKick()}
      >
        <label className="admin-field-label" htmlFor={`kick-reason-${member.identityId}`}>
          {t('spaces.members.reason', 'Reason')}
          <textarea
            id={`kick-reason-${member.identityId}`}
            className="admin-textarea"
            rows={3}
            value={kickReason}
            onChange={(e) => setKickReason(e.target.value)}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        title={t('spaces.members.banTitle', 'Ban member?')}
        variant="danger"
        confirmLabel={t('spaces.members.banConfirm', 'Ban')}
        loading={busy}
        confirmDisabled={!banReason.trim()}
        onConfirm={() => void handleBan()}
      >
        <label className="admin-field-label" htmlFor={`ban-reason-${member.identityId}`}>
          {t('spaces.members.reason', 'Reason')}
          <textarea
            id={`ban-reason-${member.identityId}`}
            className="admin-textarea"
            rows={3}
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
        </label>
        <label className="admin-field-label" htmlFor={`ban-duration-${member.identityId}`}>
          {t('spaces.members.banDuration', 'Duration')}
          <select
            id={`ban-duration-${member.identityId}`}
            className="admin-select"
            value={banDuration}
            onChange={(e) => setBanDuration(e.target.value as SpaceBanDuration)}
          >
            {BAN_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {t(`spaces.members.banDurations.${d}`, d)}
              </option>
            ))}
          </select>
        </label>
      </ConfirmDialog>
    </>
  );
}
