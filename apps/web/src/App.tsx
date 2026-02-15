import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppLayout, TourRoot } from '@chadder/ui';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Login, Verify } from './pages/auth';
import {
  AccountOverview,
  AccountAppearance,
  AccountSecurity,
  AccountPrivacy,
  AccountNotifications,
} from './pages/account';
import { useAuth } from './hooks/useAuth';
import { AppSidebar } from './components/AppSidebar';
import { TourProvider, useTourContext } from './hooks/useTourContext';

/**
 * Protected route wrapper - redirects to login if not authenticated.
 * When authenticated, renders the app layout with sidebar.
 */
function ProtectedLayout() {
  const { status } = useAuth();

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

  return (
    <TourProvider>
      <ProtectedLayoutContent />
    </TourProvider>
  );
}

/**
 * Inner layout component that has access to tour context.
 */
function ProtectedLayoutContent() {
  const tour = useTourContext();

  return (
    <>
      <TourRoot tour={tour} />
      <AppLayout sidebar={<AppSidebar />}>
        <Outlet />
      </AppLayout>
    </>
  );
}

/**
 * Auth route wrapper - redirects to home if already authenticated
 */
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-layout">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/auth/login"
        element={
          <AuthRoute>
            <Login />
          </AuthRoute>
        }
      />
      <Route
        path="/auth/verify"
        element={
          <AuthRoute>
            <Verify />
          </AuthRoute>
        }
      />

      {/* Protected Routes with Sidebar Layout */}
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />

        {/* Account Routes */}
        <Route path="/account" element={<Navigate to="/account/overview" replace />} />
        <Route path="/account/overview" element={<AccountOverview />} />
        <Route path="/account/appearance" element={<AccountAppearance />} />
        <Route path="/account/security" element={<AccountSecurity />} />
        <Route path="/account/privacy" element={<AccountPrivacy />} />
        <Route path="/account/notifications" element={<AccountNotifications />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
