import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Requires an authenticated session with platform moderator or admin permissions.
 * Renders child routes via `<Outlet />`.
 */
export function ModeratorGate() {
  const { status, session } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-layout">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/auth/login" replace />;
  }

  if (
    !session?.isPlatformModerator &&
    !session?.isPlatformAdmin &&
    !session?.isPlatformSupportAgent
  ) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
