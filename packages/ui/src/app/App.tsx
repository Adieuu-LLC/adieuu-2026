import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { TourRoot } from '../components/Tour';
import { Home } from '../pages/Home';
import { About } from '../pages/About';
import { Search } from '../pages/Search';
import { Conversation } from '../pages/Conversation';
import { Login, Verify, MfaVerify } from '../pages/auth';
import {
  AccountOverview,
  AccountSecurity,
  AccountSettings,
} from '../pages/account';
import {
  IdentityCiphers,
  IdentityContentSocial,
  IdentityDevices,
  IdentityFriends,
  IdentityPrivacy,
  IdentityProfile,
} from '../pages/identity';
import { ServiceStatus } from '../pages/ServiceStatus';
import { useAuth } from '../hooks/useAuth';
import { TourProvider, useTourContext } from '../hooks/useTourContext';
import { CipherStoreProvider } from '../hooks/useCipherStore';
import { ChatConnectionProvider } from '../hooks/useChatConnection';
import { ConversationsProvider } from '../hooks/ConversationsProvider';
import { useDmNotifications } from '../hooks/useDmNotifications';
import { usePreKeys } from '../hooks/usePreKeys';
import { KeyStorageBanner } from '../components/KeyStorageBanner';
import { WebSecurityBanner } from '../components/WebSecurityBanner';
import { UpdateBanner } from '../components/UpdateBanner';
import { AppSidebar } from './AppSidebar';
import {
  AdminAuthAllowlist,
  AdminDashboard,
  AdminGate,
  AdminLayout,
  AdminPlatformAdmins,
} from '../pages/admin';

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
      <CipherStoreProvider>
        <ChatConnectionProvider>
          <ConversationsProvider>
            <ProtectedLayoutContent />
          </ConversationsProvider>
        </ChatConnectionProvider>
      </CipherStoreProvider>
    </TourProvider>
  );
}

/**
 * Inner layout component that has access to tour context.
 * Also sets up global DM notifications for incoming messages.
 */
function ProtectedLayoutContent() {
  const tour = useTourContext();

  // Mount pre-key lifecycle management once for authenticated app runtime.
  // This enables automatic SPK rotation + cleanup and OTPK replenishment checks.
  usePreKeys();

  // Enable toast notifications for incoming DMs when not actively reading that thread (focused + visible)
  useDmNotifications();

  return (
    <>
      <TourRoot tour={tour} />
      <AppLayout sidebar={<AppSidebar />}>
        <UpdateBanner />
        <KeyStorageBanner />
        <WebSecurityBanner />
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

/**
 * Main application component with all routes.
 * Shared across all platforms (web, desktop, mobile).
 */
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
      <Route
        path="/auth/mfa"
        element={
          <AuthRoute>
            <MfaVerify />
          </AuthRoute>
        }
      />

      {/* Protected Routes with Sidebar Layout */}
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/search" element={<Search />} />
        <Route path="/conversation/:id" element={<Conversation />} />

        {/* Account Routes */}
        <Route path="/account" element={<Navigate to="/account/overview" replace />} />
        <Route path="/account/overview" element={<AccountOverview />} />
        <Route path="/account/security" element={<Navigate to="/account/security/authentication" replace />} />
        <Route path="/account/security/:tab" element={<AccountSecurity />} />
        <Route path="/account/settings" element={<AccountSettings />} />

        {/* Identity Routes */}
        <Route path="/identity" element={<Navigate to="/identity/profile" replace />} />
        <Route path="/identity/profile" element={<IdentityProfile />} />
        <Route path="/identity/friends" element={<IdentityFriends />} />
        <Route path="/identity/content" element={<IdentityContentSocial />} />
        <Route path="/identity/privacy" element={<IdentityPrivacy />} />
        <Route path="/identity/devices" element={<IdentityDevices />} />
        <Route path="/identity/ciphers" element={<IdentityCiphers />} />

        {/* Platform admin (nested layout + guard) */}
        <Route element={<AdminGate />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="platform-admins" element={<AdminPlatformAdmins />} />
            <Route path="auth-allowlist" element={<AdminAuthAllowlist />} />
          </Route>
        </Route>
      </Route>

      {/* Utility Routes (no auth required) */}
      <Route path="/service-status" element={<ServiceStatus />} />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
