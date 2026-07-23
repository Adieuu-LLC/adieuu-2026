/**
 * Space Manage shell: secondary nav (Overview + Roles) + outlet.
 * On narrow viewports the nav becomes a sticky Select (Appearance-style).
 */

import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';
import '../../styles/_spaces-manage.scss';

export function SpaceManageLayout() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasActiveSpacePermission } = useSpaces();
  const spacePath = `/s/${slug}`;
  const base = `${spacePath}/manage`;

  const canOverview = hasActiveSpacePermission('manageMetadata');
  const canRoles = hasActiveSpacePermission('manageRoles');
  const canAudit = hasActiveSpacePermission('viewAuditLog');

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`;

  const navItems = useMemo(() => {
    const items: { value: string; label: string }[] = [];
    if (canOverview) {
      items.push({ value: base, label: t('spaces.manage.nav.overview') });
    }
    if (canRoles) {
      items.push({ value: `${base}/roles`, label: t('spaces.manage.nav.roles') });
    }
    if (canAudit) {
      items.push({ value: `${base}/audit`, label: t('spaces.manage.nav.audit') });
    }
    return items;
  }, [base, canOverview, canRoles, canAudit, t]);

  const collection = useMemo(
    () => createListCollection({ items: navItems }),
    [navItems],
  );

  const activeValue = useMemo(() => {
    if (location.pathname.includes(`${base}/roles`)) {
      return `${base}/roles`;
    }
    if (location.pathname.includes(`${base}/audit`)) {
      return `${base}/audit`;
    }
    return base;
  }, [location.pathname, base]);

  const activeLabel =
    navItems.find((item) => item.value === activeValue)?.label ??
    t('spaces.manage.navLabel');

  const renderBackLink = () => (
    <Link to={spacePath} className="space-manage-back-link">
      <Icon name="arrowLeft" size="xs" />
      <span>{t('spaces.manage.nav.backToSpace')}</span>
    </Link>
  );

  return (
    <div className="admin-shell space-manage-shell">
      <aside className="admin-sub-sidebar" aria-label={t('spaces.manage.navLabel')}>
        {renderBackLink()}
        <nav className="admin-sub-nav">
          {canOverview && (
            <NavLink to={base} end className={navClass}>
              {t('spaces.manage.nav.overview')}
            </NavLink>
          )}
          {canRoles && (
            <NavLink to={`${base}/roles`} className={navClass}>
              {t('spaces.manage.nav.roles')}
            </NavLink>
          )}
          {canAudit && (
            <NavLink to={`${base}/audit`} className={navClass}>
              {t('spaces.manage.nav.audit')}
            </NavLink>
          )}
        </nav>
      </aside>

      {navItems.length > 0 && (
        <div className="space-manage-nav-select-wrapper">
          {renderBackLink()}
          <Select.Root
            collection={collection}
            value={[activeValue]}
            onValueChange={(details) => {
              const next = details.value[0];
              if (next) navigate(next);
            }}
            positioning={{ sameWidth: true }}
          >
            <Select.Control className="space-manage-nav-select-control">
              <Select.Trigger
                className="space-manage-nav-select-trigger"
                aria-label={t('spaces.manage.navLabel')}
              >
                <Select.ValueText>{activeLabel}</Select.ValueText>
                <Select.Indicator className="space-manage-nav-select-indicator">
                  <Icon name="chevronDown" size="xs" />
                </Select.Indicator>
              </Select.Trigger>
            </Select.Control>

            <Portal>
              <Select.Positioner>
                <Select.Content className="space-manage-nav-select-content">
                  {collection.items.map((item) => (
                    <Select.Item
                      key={item.value}
                      item={item}
                      className="space-manage-nav-select-item"
                    >
                      <Select.ItemText>{item.label}</Select.ItemText>
                      <Select.ItemIndicator className="space-manage-nav-select-check">
                        <Icon name="check" size="xs" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </div>
      )}

      <div className="admin-outlet">
        <Outlet />
      </div>
    </div>
  );
}
