/**
 * Route gate for Space Manage: waits for viewer permissions, then redirects
 * members without manage-UI permissions back to the Space.
 */

import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSpaces } from '../../hooks/useSpaces';
import { Spinner } from '../../components/Spinner';

export function SpaceManageGate() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const {
    activeSpace,
    activeSpaceLoading,
    canAccessSpaceManage,
    activeSpacePermissionsLoading,
  } = useSpaces();

  if (activeSpaceLoading || activeSpacePermissionsLoading || !activeSpace) {
    return (
      <div className="page-content space-manage-page">
        <div className="admin-loading" role="status" aria-label={t('common.loading')}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!canAccessSpaceManage) {
    return <Navigate to={`/s/${slug ?? activeSpace.slug}`} replace />;
  }

  return <Outlet />;
}
