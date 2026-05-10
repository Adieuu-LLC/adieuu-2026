import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useIdentity } from '../hooks/useIdentity';
import { AppLayout } from '../components/AppLayout';
import { TourRoot } from '../components/Tour';
import { Home } from '../pages/Home';
import { About } from '../pages/About';
import { AboutUpdates } from '../pages/about';
import { Download } from '../pages/Download';
import { Search } from '../pages/Search';
import { Login, Verify, MfaVerify } from '../pages/auth';
import {
  AccountOverview,
  AccountSecurity,
  AccountSubscription,
  ThemeBrowser,
} from '../pages/account';
import { CheckoutComplete } from '../pages/checkout/CheckoutComplete';
import {
  IdentityAppearance,
  IdentityCiphers,
  IdentityCustomEmojis,
  IdentityDevices,
  IdentityNotifications,
  IdentityPrivacy,
  IdentityProfile,
  IdentityProfileView,
} from '../pages/identity';
import { ServiceStatus } from '../pages/ServiceStatus';
import { ConversationView, NewConversation } from '../pages/conversations';
import { useAuth } from '../hooks/useAuth';
import { isAccountSidebarHidden } from './sidebar/identity';
import { TourProvider, useTourContext, useAppearanceTour } from '../hooks/useTourContext';
import { CipherStoreProvider } from '../hooks/useCipherStore';
import { ChatSocketProvider } from '../hooks/useChatSocket';
import { FriendsProvider } from '../hooks/useFriends';
import { BlockProvider } from '../hooks/useBlockContext';
import { ConversationsProvider } from '../hooks/useConversations';
import { MediaOutboxProvider } from '../services/mediaOutbox';
import { ConversationPreferencesProvider } from '../hooks/useConversationPreferences';
import { usePreKeys } from '../hooks/usePreKeys';
import { KeyStorageBanner } from '../components/KeyStorageBanner';
import { WebSecurityBanner } from '../components/WebSecurityBanner';
import { UpdateOverlay } from '../components/UpdateOverlay';
import { AchievementListener } from '../components/AchievementListener';
import { AppPlainTextContextMenu } from '../components/AppPlainTextContextMenu';
import { UpdateProvider } from '../hooks/useUpdateContext';
import { IdentityModalProvider } from '../hooks/useIdentityModal';
import { AppSidebar } from './AppSidebar';
import {
  AdminAuthAllowlist,
  AdminAgeVerification,
  AdminDashboard,
  AdminGate,
  AdminLayout,
  AdminPlatformAdmins,
} from '../pages/admin';
import {
  ModeratorGate,
  ModeratorLayout,
  ReportList,
  ReportDetail,
} from '../pages/moderation';

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

  // Allow access for both account sessions and identity sessions.
  // 'identity_mode' means the cookie holds a valid identity session.
  if (status === 'unauthenticated') {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <TourProvider>
      <CipherStoreProvider>
        <ChatSocketProvider>
          <FriendsProvider>
            <BlockProvider>
              <ConversationPreferencesProvider>
                <ConversationsProvider>
                  <MediaOutboxProvider>
                    <UpdateProvider>
                      <ProtectedLayoutContent />
                    </UpdateProvider>
                  </MediaOutboxProvider>
                </ConversationsProvider>
              </ConversationPreferencesProvider>
            </BlockProvider>
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
      <IdentityModalProvider>
        <AppLayout sidebar={<AppSidebar />}>
          <KeyStorageBanner />
          <WebSecurityBanner />
          <Outlet />
        </AppLayout>
      </IdentityModalProvider>
      <UpdateOverlay />
      <AchievementListener />
      <AppPlainTextContextMenu />
    </>
  );
}

/**
 * Auth route wrapper - redirects to home if already authenticated
 */
/**
 * Account routes (email/phone session, MFA, billing-adjacent controls) are not available
 * in an active alias context (identity session, unlocked alias, lock screen, or suspension)
 * — same rule as the account flyout in the sidebar.
 */
function AccountSessionOnlyOutlet() {
  const { status: authStatus } = useAuth();
  const { status: identityStatus } = useIdentity();
  if (isAccountSidebarHidden(authStatus, identityStatus)) {
    return <Navigate to="/identity/profile" replace />;
  }
  return <Outlet />;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-layout">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (status === 'authenticated' || status === 'identity_mode') {
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
        <Route path="/about/updates" element={<AboutUpdates />} />
        <Route path="/download" element={<Download />} />
        <Route path="/search" element={<Search />} />

        {/* Account Routes (not available while alias session is unlocked) */}
        <Route element={<AccountSessionOnlyOutlet />}>
          <Route path="/account" element={<Navigate to="/account/overview" replace />} />
          <Route path="/account/overview" element={<AccountOverview />} />
          <Route path="/account/security" element={<Navigate to="/account/security/authentication" replace />} />
          <Route path="/account/security/:tab" element={<AccountSecurity />} />
          <Route path="/account/subscription" element={<Navigate to="/account/subscription/manage" replace />} />
          <Route path="/account/subscription/:tab" element={<AccountSubscription />} />
          <Route path="/account/settings" element={<Navigate to="/identity/notifications" replace />} />
          <Route path="/account/appearance" element={<Navigate to="/identity/appearance" replace />} />
          <Route path="/account/appearance/community" element={<ThemeBrowser />} />
        </Route>

        {/* Identity Routes */}
        <Route path="/identity" element={<Navigate to="/identity/profile" replace />} />
        <Route path="/identity/profile" element={<IdentityProfile />} />
        {/* Longer static path before `/identity/appearance` so routers never prefer a dynamic match. */}
        <Route path="/identity/appearance/community" element={<ThemeBrowser />} />
        <Route path="/identity/appearance" element={<IdentityAppearance />} />
        <Route path="/identity/notifications" element={<IdentityNotifications />} />
        <Route path="/identity/privacy" element={<IdentityPrivacy />} />
        <Route path="/identity/devices" element={<IdentityDevices />} />
        <Route path="/identity/ciphers" element={<IdentityCiphers />} />
        <Route path="/identity/emojis" element={<IdentityCustomEmojis />} />
        <Route path="/identity/subscription" element={<Navigate to="/identity/subscription/manage" replace />} />
        <Route path="/identity/subscription/:tab" element={<AccountSubscription />} />

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
            <Route path="age-verification" element={<AdminAgeVerification />} />
          </Route>
        </Route>

        {/* Platform moderation (moderator + admin guard) */}
        <Route element={<ModeratorGate />}>
          <Route path="/moderation" element={<ModeratorLayout />}>
            <Route index element={<Navigate to="reports" replace />} />
            <Route path="reports" element={<ReportList />} />
            <Route path="reports/:id" element={<ReportDetail />} />
          </Route>
        </Route>
      </Route>

      {/* Utility Routes (no auth required) */}
      <Route path="/service-status" element={<ServiceStatus />} />
      <Route path="/checkout/complete" element={<CheckoutComplete />} />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
