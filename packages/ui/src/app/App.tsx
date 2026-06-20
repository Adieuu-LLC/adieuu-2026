import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useIdentity } from '../hooks/useIdentity';
import { AppLayout } from '../components/AppLayout';
import { TourRoot } from '../components/Tour';
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
import { ConversationFoldersProvider } from '../hooks/useConversationFolders';
import { usePreKeys } from '../hooks/usePreKeys';
import { KeyStorageBanner } from '../components/KeyStorageBanner';
import { UpdateOverlay } from '../components/UpdateOverlay';
import { AchievementListener } from '../components/AchievementListener';
import { SubscriptionChangeListener } from '../components/SubscriptionChangeListener';
import { AppPlainTextContextMenu } from '../components/AppPlainTextContextMenu';
import { UpdateProvider } from '../hooks/useUpdateContext';
import { ToasterOutlet } from '../components/Toast';
import { IdentityModalProvider } from '../hooks/useIdentityModal';
import { CallSessionProvider } from '../hooks/useCallSession';
import { GlobalCallEventsProvider } from '../hooks/useGlobalCallEvents';
import { AppCallOverlay } from '../components/call/AppCallOverlay';
import { useIncomingCallRinger } from '../hooks/useIncomingCallRinger';
import { AppSidebar } from './AppSidebar';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';

// ============================================================================
// Lazily-loaded route pages
// ============================================================================
// Route components are code-split so heavy/rare areas (admin → recharts,
// conversations, moderation, identity, legal) stay out of the initial bundle.
// Each lazy() points at a concrete module or a feature barrel (one chunk per
// feature). All providers/layout/overlays above remain eager so context and
// persistent UI (sidebar, call audio) survive navigation.

function lazyRoute<M, K extends keyof M>(loader: () => Promise<M>, key: K) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[key] as ComponentType };
  });
}

const Home = lazyRoute(() => import('../pages/Home'), 'Home');
const PublicHome = lazyRoute(() => import('../pages/PublicHome'), 'PublicHome');
const About = lazyRoute(() => import('../pages/About'), 'About');
const AboutLearn = lazyRoute(() => import('../pages/about'), 'AboutLearn');
const AboutUpdates = lazyRoute(() => import('../pages/about'), 'AboutUpdates');
const AboutRoadmap = lazyRoute(() => import('../pages/about'), 'AboutRoadmap');
const Download = lazyRoute(() => import('../pages/Download'), 'Download');
const Search = lazyRoute(() => import('../pages/Search'), 'Search');
const PublicSpaces = lazyRoute(() => import('../pages/spaces'), 'PublicSpaces');
const Login = lazyRoute(() => import('../pages/auth'), 'Login');
const Verify = lazyRoute(() => import('../pages/auth'), 'Verify');
const MfaVerify = lazyRoute(() => import('../pages/auth'), 'MfaVerify');
const AccountOverview = lazyRoute(() => import('../pages/account'), 'AccountOverview');
const AccountSecurity = lazyRoute(() => import('../pages/account'), 'AccountSecurity');
const AccountSubscription = lazyRoute(() => import('../pages/account'), 'AccountSubscription');
const ThemeBrowser = lazyRoute(() => import('../pages/account'), 'ThemeBrowser');
const ReferralPage = lazyRoute(() => import('../pages/account'), 'ReferralPage');
const AgeVerificationPage = lazyRoute(() => import('../pages/account'), 'AgeVerificationPage');
const CheckoutComplete = lazyRoute(() => import('../pages/checkout/CheckoutComplete'), 'CheckoutComplete');
const RequestSponsorshipPage = lazyRoute(() => import('../pages/sponsorship'), 'RequestSponsorshipPage');
const SponsorshipDirectoryPage = lazyRoute(() => import('../pages/sponsorship'), 'SponsorshipDirectoryPage');
const IdentityAppearance = lazyRoute(() => import('../pages/identity'), 'IdentityAppearance');
const IdentityCiphers = lazyRoute(() => import('../pages/identity'), 'IdentityCiphers');
const IdentityCustomEmojis = lazyRoute(() => import('../pages/identity'), 'IdentityCustomEmojis');
const IdentityDevices = lazyRoute(() => import('../pages/identity'), 'IdentityDevices');
const IdentityNotifications = lazyRoute(() => import('../pages/identity'), 'IdentityNotifications');
const IdentityPrivacy = lazyRoute(() => import('../pages/identity'), 'IdentityPrivacy');
const IdentityProfile = lazyRoute(() => import('../pages/identity'), 'IdentityProfile');
const IdentityProfileView = lazyRoute(() => import('../pages/identity'), 'IdentityProfileView');
const ServiceStatus = lazyRoute(() => import('../pages/ServiceStatus'), 'ServiceStatus');
const ReferralLanding = lazyRoute(() => import('../pages/public/ReferralLanding'), 'ReferralLanding');
const ConversationView = lazyRoute(() => import('../pages/conversations/ConversationView'), 'ConversationView');
const NewConversation = lazyRoute(() => import('../pages/conversations/NewConversation'), 'NewConversation');
const AdminAuthAllowlist = lazyRoute(() => import('../pages/admin'), 'AdminAuthAllowlist');
const AdminAgeVerification = lazyRoute(() => import('../pages/admin'), 'AdminAgeVerification');
const AdminDashboard = lazyRoute(() => import('../pages/admin'), 'AdminDashboard');
const AdminGate = lazyRoute(() => import('../pages/admin'), 'AdminGate');
const AdminLayout = lazyRoute(() => import('../pages/admin'), 'AdminLayout');
const AdminPlatformAdmins = lazyRoute(() => import('../pages/admin'), 'AdminPlatformAdmins');
const AdminUserSearch = lazyRoute(() => import('../pages/admin'), 'AdminUserSearch');
const AdminUserProfile = lazyRoute(() => import('../pages/admin'), 'AdminUserProfile');
const AdminIdentitySearch = lazyRoute(() => import('../pages/admin'), 'AdminIdentitySearch');
const AdminIdentityProfile = lazyRoute(() => import('../pages/admin'), 'AdminIdentityProfile');
const AdminPromoCodes = lazyRoute(() => import('../pages/admin'), 'AdminPromoCodes');
const ModeratorGate = lazyRoute(() => import('../pages/moderation'), 'ModeratorGate');
const ModeratorLayout = lazyRoute(() => import('../pages/moderation'), 'ModeratorLayout');
const ReportList = lazyRoute(() => import('../pages/moderation'), 'ReportList');
const ReportDetail = lazyRoute(() => import('../pages/moderation'), 'ReportDetail');
const TicketList = lazyRoute(() => import('../pages/moderation'), 'TicketList');
const ModerationTicketDetail = lazyRoute(() => import('../pages/moderation'), 'TicketDetail');
const MyTickets = lazyRoute(() => import('../pages/support'), 'MyTickets');
const SubmitTicket = lazyRoute(() => import('../pages/support'), 'SubmitTicket');
const TicketDetail = lazyRoute(() => import('../pages/support'), 'TicketDetail');
const FeedbackList = lazyRoute(() => import('../pages/feedback'), 'FeedbackList');
const FeedbackDetail = lazyRoute(() => import('../pages/feedback'), 'FeedbackDetail');
const SubmitFeedback = lazyRoute(() => import('../pages/feedback'), 'SubmitFeedback');
const LegalPoliciesPage = lazyRoute(() => import('../legal'), 'LegalPoliciesPage');
const LegalPolicyPage = lazyRoute(() => import('../legal'), 'LegalPolicyPage');

/** Fallback shown in the content area while a lazy route chunk loads. */
function RouteFallback() {
  return (
    <div className="route-loading">
      <div className="spinner spinner-lg" />
    </div>
  );
}

/**
 * Unified app shell that sits above both public and protected route groups.
 * Authenticated users get the full provider stack + sidebar once, so navigating
 * between public pages (Roadmap, Search) and protected pages (Conversations,
 * Account) no longer remounts providers or refetches data.
 * Unauthenticated users get a lightweight public sidebar with no provider overhead.
 */
function AuthenticatedShell() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-layout">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (status === 'authenticated' || status === 'identity_mode') {
    return (
      <TourProvider>
        <CipherStoreProvider>
          <ChatSocketProvider>
            <FriendsProvider>
              <BlockProvider>
                <ConversationPreferencesProvider>
                  <ConversationFoldersProvider>
                    <ConversationsProvider>
                      <MediaOutboxProvider>
                      <CallSessionProvider>
                        <GlobalCallEventsProvider>
                          <AuthenticatedShellContent />
                        </GlobalCallEventsProvider>
                      </CallSessionProvider>
                      </MediaOutboxProvider>
                    </ConversationsProvider>
                  </ConversationFoldersProvider>
                </ConversationPreferencesProvider>
              </BlockProvider>
            </FriendsProvider>
          </ChatSocketProvider>
        </CipherStoreProvider>
      </TourProvider>
    );
  }

  return (
    <AppLayout sidebar={<AppSidebar variant="public" />}>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}

/**
 * Inner layout for authenticated users. Has access to tour context and sets up
 * pre-key management, incoming call ringtones, and global overlays.
 */
function AuthenticatedShellContent() {
  const tour = useTourContext();
  const appearanceTour = useAppearanceTour();

  usePreKeys();
  useIncomingCallRinger();

  return (
    <>
      <TourRoot tour={tour} />
      <TourRoot tour={appearanceTour} />
      <IdentityModalProvider>
        <AppLayout sidebar={<AppSidebar />}>
          <KeyStorageBanner />
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </AppLayout>
      </IdentityModalProvider>
      <AppCallOverlay />
      <UpdateOverlay />
      <AchievementListener />
      <SubscriptionChangeListener />
      <AppPlainTextContextMenu />
    </>
  );
}

/**
 * Thin guard for protected routes — redirects unauthenticated users to login.
 * Does not mount any providers or layout; the parent AuthenticatedShell handles that.
 */
function ProtectedGuard() {
  const { status } = useAuth();
  if (status === 'unauthenticated') {
    return <Navigate to="/auth/login" replace />;
  }
  return <Outlet />;
}

/**
 * Root path handler. Authenticated users see their Home dashboard;
 * unauthenticated visitors see the public landing page.
 */
function RootRedirect() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-layout">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <PublicHome />;
  }

  return <Home />;
}

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

function AuthRoute({ children }: { children: ReactNode }) {
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
    <UpdateProvider>
    <ToasterOutlet />
    <RouteErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
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

      {/* Unified shell: single provider tree for authenticated users, public sidebar for guests */}
      <Route element={<AuthenticatedShell />}>

        {/* Public Routes (no auth required) */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/about" element={<About />} />
        <Route path="/about/learn" element={<AboutLearn />} />
        <Route path="/about/roadmap" element={<AboutRoadmap />} />
        <Route path="/about/updates" element={<AboutUpdates />} />
        <Route path="/download" element={<Download />} />
        <Route path="/search" element={<Search />} />
        <Route path="/spaces" element={<PublicSpaces />} />
        <Route path="/identity/:id" element={<IdentityProfileView />} />
        <Route path="/legal-policies" element={<LegalPoliciesPage />} />
        <Route path="/legal-policies/:slug" element={<LegalPolicyPage />} />
        <Route path="/feedback" element={<FeedbackList />} />
        <Route path="/feedback/:postId" element={<FeedbackDetail />} />

        {/* Protected Routes (auth required — ProtectedGuard redirects guests to login) */}
        <Route element={<ProtectedGuard />}>

          {/* Account Routes (not available while alias session is unlocked) */}
          <Route element={<AccountSessionOnlyOutlet />}>
            <Route path="/account" element={<Navigate to="/account/overview" replace />} />
            <Route path="/account/overview" element={<AccountOverview />} />
            <Route path="/account/security" element={<Navigate to="/account/security/authentication" replace />} />
            <Route path="/account/security/:tab" element={<AccountSecurity />} />
            <Route path="/account/subscription" element={<Navigate to="/account/subscription/manage" replace />} />
            <Route path="/account/subscription/:tab" element={<AccountSubscription />} />
            <Route path="/account/referrals" element={<ReferralPage />} />
            <Route path="/account/age-verification" element={<AgeVerificationPage />} />
            <Route path="/account/settings" element={<Navigate to="/identity/notifications" replace />} />
            <Route path="/account/appearance" element={<Navigate to="/identity/appearance" replace />} />
            <Route path="/account/appearance/community" element={<ThemeBrowser />} />
            <Route path="/sponsorship/request" element={<RequestSponsorshipPage />} />
            <Route path="/sponsorship/directory" element={<SponsorshipDirectoryPage />} />
          </Route>

          {/* Support tickets (account or identity session) */}
          <Route path="/support" element={<MyTickets />} />
          <Route path="/support/new" element={<SubmitTicket />} />
          <Route path="/support/:ticketId" element={<TicketDetail />} />

          {/* Community feedback — submit requires identity session */}
          <Route path="/feedback/new" element={<SubmitFeedback />} />

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
              <Route path="users" element={<AdminUserSearch />} />
              <Route path="users/:id" element={<AdminUserProfile />} />
              <Route path="identities" element={<AdminIdentitySearch />} />
              <Route path="identities/:id" element={<AdminIdentityProfile />} />
              <Route path="promo-codes" element={<AdminPromoCodes />} />
            </Route>
          </Route>

          {/* Platform moderation (moderator + admin guard) */}
          <Route element={<ModeratorGate />}>
            <Route path="/moderation" element={<ModeratorLayout />}>
              <Route index element={<Navigate to="tickets" replace />} />
              <Route path="reports" element={<ReportList />} />
              <Route path="reports/:id" element={<ReportDetail />} />
              <Route path="tickets" element={<TicketList />} />
              <Route path="tickets/:id" element={<ModerationTicketDetail />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Utility Routes (no auth required) */}
      <Route path="/refer/:code" element={<ReferralLanding />} />
      <Route path="/service-status" element={<ServiceStatus />} />
      <Route path="/checkout/complete" element={<CheckoutComplete />} />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
    </UpdateProvider>
  );
}
