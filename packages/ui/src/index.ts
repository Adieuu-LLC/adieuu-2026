// ============================================================================
// Shared App & Pages
// ============================================================================

export { App, AppSidebar } from './app';
export {
  Home,
  About,
  Login,
  Verify,
  AccountOverview,
  AccountAppearance,
  AccountSecurity,
  AccountPrivacy,
  AccountNotifications,
} from './pages';

// ============================================================================
// Platform Configuration & Capabilities
// ============================================================================

export {
  PlatformProvider,
  usePlatformContext,
  useAppConfig,
  usePlatformCapabilities,
  usePlatformFeatures,
} from './config';

export type {
  AppConfig,
  PlatformCapabilities,
  PlatformContextValue,
  PlatformFeatures,
  SecureStorage,
  FileSystem,
  Notifications,
  PlatformProviderProps,
} from './config';

// ============================================================================
// Auth, Identity & Tour Hooks
// ============================================================================

export { useAuth, AuthProvider } from './hooks/useAuth';
export { useIdentity, IdentityProvider } from './hooks/useIdentity';
export { useTourContext, TourProvider } from './hooks/useTourContext';

export type {
  AuthStatus,
  AuthState,
  AuthContextValue,
  AuthProviderProps,
} from './hooks/useAuth';
export type {
  IdentityStatus,
  IdentityState,
  IdentityContextValue,
  IdentityProviderProps,
  CreateIdentityResult,
  LoginIdentityResult,
} from './hooks/useIdentity';
export type { TourProviderProps } from './hooks/useTourContext';

// ============================================================================
// UI Components
// ============================================================================

export { Button } from './components/Button';
export { Input } from './components/Input';
export { OtpInput } from './components/OtpInput';
export { Card } from './components/Card';
export { Logo } from './components/Logo';
export { Alert } from './components/Alert';
export { Spinner } from './components/Spinner';
export { AuthLayout } from './components/AuthLayout';
export { AppLayout } from './components/AppLayout';
export {
  Sidebar,
  SidebarItem,
  SidebarSubItem,
  SidebarDivider,
  SidebarSection,
  useSidebar,
} from './components/Sidebar';
export { Tabs, TabList, TabTrigger, TabContent } from './components/Tabs';
export { TourRoot, useTour, createTourSteps } from './components/Tour';
export { Avatar } from './components/Avatar';
export { Tooltip } from './components/Tooltip';
export { ToastProvider, useToast } from './components/Toast';

// ============================================================================
// Icons
// ============================================================================

export {
  HomeIcon,
  MessageIcon,
  UsersIcon,
  SettingsIcon,
  InfoIcon,
  LogoutIcon,
  ShieldIcon,
  KeyIcon,
  BellIcon,
  SearchIcon,
  UserIcon,
  PaletteIcon,
  LockIcon,
  MaskIcon,
  PlusIcon,
  InfoCircleIcon,
} from './components/Icons';

// ============================================================================
// Utility Hooks
// ============================================================================

export { usePlatform } from './hooks/usePlatform';

// ============================================================================
// Component Types
// ============================================================================

export type { ButtonProps } from './components/Button';
export type { InputProps } from './components/Input';
export type { OtpInputProps } from './components/OtpInput';
export type { CardProps } from './components/Card';
export type { LogoProps } from './components/Logo';
export type { AlertProps } from './components/Alert';
export type { SpinnerProps } from './components/Spinner';
export type { AuthLayoutProps } from './components/AuthLayout';
export type { AppLayoutProps } from './components/AppLayout';
export type {
  SidebarProps,
  SidebarItemProps,
  SidebarSubItemProps,
  SidebarSectionProps,
  SidebarOrientation,
} from './components/Sidebar';
export type {
  TourStep,
  TourStepAction,
  TourRootProps,
  TourApi,
} from './components/Tour';
export type { AvatarProps, AvatarInfo } from './components/Avatar';
export type { TooltipProps } from './components/Tooltip';
export type { ToastOptions, ToastVariant, ToastContextValue, ToastProviderProps } from './components/Toast';
