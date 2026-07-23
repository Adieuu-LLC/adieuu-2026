/**
 * Overview requires manageMetadata; otherwise redirect to Roles (or Space home).
 */

import { Navigate, useParams } from 'react-router-dom';
import { useSpaces } from '../../hooks/useSpaces';
import { SpaceManageOverview } from './SpaceManageOverview';

export function SpaceManageOverviewGate() {
  const { slug } = useParams<{ slug: string }>();
  const { hasActiveSpacePermission, activeSpace } = useSpaces();

  if (hasActiveSpacePermission('manageMetadata')) {
    return <SpaceManageOverview />;
  }
  if (hasActiveSpacePermission('manageRoles')) {
    return <Navigate to={`/s/${slug ?? activeSpace?.slug}/manage/roles`} replace />;
  }
  return <Navigate to={`/s/${slug ?? activeSpace?.slug}`} replace />;
}
