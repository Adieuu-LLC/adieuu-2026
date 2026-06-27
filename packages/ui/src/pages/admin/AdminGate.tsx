import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Requires an authenticated platform admin session. Renders child routes via `<Outlet />`.
 */
export function AdminGate() {
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

  if (!session?.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
