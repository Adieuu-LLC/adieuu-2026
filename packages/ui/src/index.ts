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
  IdentityCiphers,
  IdentityContentSocial,
  IdentityDevices,
  IdentityFriends,
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
  PlatformProviderProps,
} from './config';

// ============================================================================
// Auth, Identity & Tour Hooks
// ============================================================================

export { useAuth, AuthProvider } from './hooks/useAuth';
export { useIdentity, IdentityProvider } from './hooks/useIdentity';
export { useTourContext, TourProvider } from './hooks/useTourContext';
export { useIdentitySearch } from './hooks/useIdentitySearch';
export { useConversationsList } from './hooks/useConversations';
export { useDmConversationsList } from './hooks/useDmConversationsList';
export type { DmConversationWithParticipant } from './hooks/useDmConversationsList';
export { useMarkAsRead } from './hooks/useMarkAsRead';
export { ConversationsProvider, useConversationsContext } from './hooks/ConversationsProvider';
export type { ConversationsContextValue, ConversationsProviderProps } from './hooks/ConversationsProvider';
export { useDocumentVisibility } from './hooks/useDocumentVisibility';
export type { UseDocumentVisibilityResult } from './hooks/useDocumentVisibility';
export { useChatConnection, ChatConnectionProvider } from './hooks/useChatConnection';
export type { ChatConnectionProviderProps, ChatConnectionContextValue } from './hooks/useChatConnection';
export { useDmSubscription } from './hooks/useDmSubscription';
export type { DmEvent, DmNewMessageEvent, DmReadStateEvent, DmTypingEvent, DmDeletedEvent } from './hooks/useDmSubscription';
export { useDmNotifications } from './hooks/useDmNotifications';
export { useDeleteMessage } from './hooks/useDeleteMessage';
export type { DeleteMessageResult, UseDeleteMessageResult } from './hooks/useDeleteMessage';

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
export type {
  UseConversationsListOptions,
  UseConversationsListResult,
} from './hooks/useConversations';
export {
  useSendDmMessage,
  useDmConversation,
  useDmMessages,
  deriveConversationId,
} from './hooks/useDmMessages';
export type {
  SendDmMessageInput,
  SendDmMessageResult,
  DecryptedDmMessage,
  UseSendDmMessageResult,
  UseDmConversationResult,
  UseDmMessagesOptions,
  UseDmMessagesResult,
} from './hooks/useDmMessages';
export type { DecryptedMessageContent } from './services/dmMessageService';
export { setDeviceKeyStorageBackend, migrateIndexedDbToBackend } from './services/deviceKeyStorage';
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
export { IdentityCard, IdentityCardCompact } from './components/IdentityCard';
export { HoverCard } from './components/HoverCard';
export { SidebarTabs } from './components/SidebarTabs';
export { FriendListItem } from './components/FriendListItem';
export { SidebarFriendsList } from './components/SidebarFriendsList';
export { AvatarGroup } from './components/AvatarGroup';
export { ConversationListItem } from './components/ConversationListItem';
export { SidebarConversationsList } from './components/SidebarConversationsList';
export { MessageComposer, TTL_OPTIONS } from './components/MessageComposer';
export { KeyStorageBanner } from './components/KeyStorageBanner';
export { ExportKeyBackupModal } from './components/ExportKeyBackupModal';
export { ImportKeyBackupModal } from './components/ImportKeyBackupModal';
export type { ExportKeyBackupModalProps } from './components/ExportKeyBackupModal';
export type { ImportKeyBackupModalProps } from './components/ImportKeyBackupModal';
export type { MessageComposerProps, SendMessageData, TtlOption } from './components/MessageComposer';

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
  SpacesIcon,
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
export type { FriendListItemProps } from './components/FriendListItem';
export type { AvatarGroupProps } from './components/AvatarGroup';
export type { ConversationListItemProps } from './components/ConversationListItem';
