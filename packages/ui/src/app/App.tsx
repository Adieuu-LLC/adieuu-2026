import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { TourRoot } from '../components/Tour';
import { Home } from '../pages/Home';
import { About } from '../pages/About';
import { Download } from '../pages/Download';
import { Search } from '../pages/Search';
import { Login, Verify, MfaVerify } from '../pages/auth';
import {
  AccountOverview,
  AccountSecurity,
  AccountSettings,
  AccountAppearance,
  ThemeBrowser,
} from '../pages/account';
import {
  IdentityAppearance,
  IdentityCiphers,
  IdentityDevices,
  IdentityPrivacy,
  IdentityProfile,
  IdentityProfileView,
} from '../pages/identity';
import { ServiceStatus } from '../pages/ServiceStatus';
import { ConversationView, NewConversation } from '../pages/conversations';
import { useAuth } from '../hooks/useAuth';
import { TourProvider, useTourContext, useAppearanceTour } from '../hooks/useTourContext';
import { CipherStoreProvider } from '../hooks/useCipherStore';
import { ChatSocketProvider } from '../hooks/useChatSocket';
import { FriendsProvider } from '../hooks/useFriends';
import { ConversationsProvider } from '../hooks/useConversations';
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
        <ChatSocketProvider>
          <FriendsProvider>
            <ConversationsProvider>
              <ProtectedLayoutContent />
            </ConversationsProvider>
          </FriendsProvider>
        </ChatSocketProvider>
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
  const appearanceTour = useAppearanceTour();

  // Mount pre-key lifecycle management once for authenticated app runtime.
  // This enables automatic SPK rotation + cleanup and OTPK replenishment checks.
  usePreKeys();

  return (
    <>
      <TourRoot tour={tour} />
      <TourRoot tour={appearanceTour} />
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
        <Route path="/download" element={<Download />} />
        <Route path="/search" element={<Search />} />

        {/* Account Routes */}
        <Route path="/account" element={<Navigate to="/account/overview" replace />} />
        <Route path="/account/overview" element={<AccountOverview />} />
        <Route path="/account/security" element={<Navigate to="/account/security/authentication" replace />} />
        <Route path="/account/security/:tab" element={<AccountSecurity />} />
        <Route path="/account/settings" element={<AccountSettings />} />
        <Route path="/account/appearance" element={<AccountAppearance />} />
        <Route path="/account/appearance/community" element={<ThemeBrowser />} />

        {/* Identity Routes */}
        <Route path="/identity" element={<Navigate to="/identity/profile" replace />} />
        <Route path="/identity/profile" element={<IdentityProfile />} />
        <Route path="/identity/appearance" element={<IdentityAppearance />} />
        <Route path="/identity/privacy" element={<IdentityPrivacy />} />
        <Route path="/identity/devices" element={<IdentityDevices />} />
        <Route path="/identity/ciphers" element={<IdentityCiphers />} />

        {/* Public identity profile view (must be after static /identity/* routes) */}
        <Route path="/identity/:id" element={<IdentityProfileView />} />

        {/* Conversation Routes */}
        <Route path="/conversations/new" element={<NewConversation />} />
        <Route path="/conversations/:id" element={<ConversationView />} />

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
