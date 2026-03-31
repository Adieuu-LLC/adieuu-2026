// ============================================================================
// Shared App & Pages
// ============================================================================

export { App, AppSidebar } from './app';
export {
  Home,
  About,
  Search,
  Login,
  Verify,
  AccountOverview,
  AccountSecurity,
  AccountSettings,
  AccountAppearance,
  ThemeBrowser,
  IdentityCiphers,
  IdentityDevices,
  IdentityPrivacy,
  IdentityProfile,
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
  StorageStatus,
  FileSystem,
  Notifications,
  AudioCapabilities,
  WebAuthnBridge,
  PlatformProviderProps,
} from './config';

// ============================================================================
// Auth, Identity & Tour Hooks
// ============================================================================

export { useAuth, AuthProvider } from './hooks/useAuth';
export { useIdentity, IdentityProvider } from './hooks/useIdentity';
export { useTheme, ThemeProvider } from './hooks/useTheme';
export type { ThemeContextValue, ThemeProviderProps } from './hooks/useTheme';
export { useIconPack, IconPackProvider } from './hooks/useIconPack';
export type { IconPackContextValue, IconPackProviderProps } from './hooks/useIconPack';
export { useTourContext, TourProvider } from './hooks/useTourContext';
export { useIdentitySearch } from './hooks/useIdentitySearch';
export { useChatSocket, ChatSocketProvider } from './hooks/useChatSocket';
export type { ChatSocketContextValue, ChatSocketProviderProps, ChatMessageHandler, ChatStateHandler } from './hooks/useChatSocket';
export { useFriends, FriendsProvider } from './hooks/useFriends';
export type { FriendsContextValue, FriendsProviderProps } from './hooks/useFriends';
export { useDocumentVisibility } from './hooks/useDocumentVisibility';
export type { UseDocumentVisibilityResult } from './hooks/useDocumentVisibility';
export {
  useNativeNotificationsPreference,
  setNativeNotificationsEnabled,
  getNativeNotificationsEnabled,
} from './hooks/useNativeNotificationsPreference';

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
export type {
  UseIdentitySearchOptions,
  UseIdentitySearchResult,
} from './hooks/useIdentitySearch';

export { setDeviceKeyStorageBackend, migrateIndexedDbToBackend } from './services/deviceKeyStorage';
export { setPreKeyStorageBackend } from './services/preKeyStorage';
export { usePreKeys } from './hooks/usePreKeys';
export type {
  ForwardSecrecyConfig,
  SecurityLevel,
  SpkDeletionPolicy,
} from './services/preKeyService';
export {
  exportKeyBackup,
  decryptKeyBackup,
  parseKeyBackupHeader,
  applyKeyBackupImport,
  getExportFilename,
  KeyBackupError,
} from './services/keyBackupService';
export type {
  BackupContentType,
  KeyBackupHeader,
  KeyBackupPayload,
  KeyBackupImportResult,
} from './services/keyBackupService';

// ============================================================================
// UI Components
// ============================================================================

export { Button } from './components/Button';
export { Input } from './components/Input';
export { OtpInput } from './components/OtpInput';
export { Card } from './components/Card';
export { Logo } from './components/Logo';
export { LogoSvg } from './components/LogoSvg';
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
export { SidebarSearch } from './components/SidebarSearch';
export { NotificationSoundSelect } from './components/NotificationSoundSelect';
export type { NotificationSoundSelectProps, NotificationSoundSelectLabels } from './components/NotificationSoundSelect';
export {
  BUILTIN_NOTIFICATION_SOUNDS,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
} from './constants/builtinNotificationSounds';
export type { BuiltinNotificationSoundId } from './constants/builtinNotificationSounds';
export { IdentityCard, IdentityCardCompact } from './components/IdentityCard';
export { HoverCard } from './components/HoverCard';
export { SidebarTabs } from './components/SidebarTabs';
export { AvatarGroup } from './components/AvatarGroup';
export { KeyStorageBanner } from './components/KeyStorageBanner';
export { UpdateBanner } from './components/UpdateBanner';
export { ExportKeyBackupModal } from './components/ExportKeyBackupModal';
export { ImportKeyBackupModal } from './components/ImportKeyBackupModal';
export type { ExportKeyBackupModalProps } from './components/ExportKeyBackupModal';
export type { ImportKeyBackupModalProps } from './components/ImportKeyBackupModal';

// ============================================================================
// Icons
// ============================================================================

export { Icon } from './icons/Icon';
export type { IconProps, AppIconName } from './icons/Icon';
export { APP_ICON_NAMES } from './icons/appIcons';
export { ICON_PACKS, DEFAULT_ICON_PACK_ID, getIconPack } from './icons/packs';
export type { IconPackDefinition, IconPackId } from './icons/packs';

// ============================================================================
// Utility Hooks
// ============================================================================

export { usePlatform } from './hooks/usePlatform';
export { useUpdateCheck } from './hooks/useUpdateCheck';
export type { UpdateStatus, UseUpdateCheckResult } from './hooks/useUpdateCheck';
export { useReleases } from './hooks/useReleases';
export type { ReleaseEntry, ReleaseDownload, UseReleasesResult } from './hooks/useReleases';

// ============================================================================
// Component Types
// ============================================================================

export type { ButtonProps } from './components/Button';
export type { InputProps } from './components/Input';
export type { OtpInputProps } from './components/OtpInput';
export type { CardProps } from './components/Card';
export type { LogoProps } from './components/Logo';
export type { LogoSvgProps } from './components/LogoSvg';
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
  TourStepEffect,
  TourRootProps,
  TourApi,
} from './components/Tour';
export type { AvatarProps, AvatarInfo, AvatarSize } from './components/Avatar';
export type { TooltipProps } from './components/Tooltip';
export type { ToastOptions, ToastVariant, ToastContextValue, ToastProviderProps } from './components/Toast';
export type { SidebarSearchProps } from './components/SidebarSearch';
export type { IdentityCardProps } from './components/IdentityCard';
export type { HoverCardProps } from './components/HoverCard';
export type { SidebarTab, SidebarTabsProps } from './components/SidebarTabs';
export type { AvatarGroupProps } from './components/AvatarGroup';
