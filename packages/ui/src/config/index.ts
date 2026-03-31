// Platform configuration and capabilities
export {
  PlatformProvider,
  usePlatformContext,
  useAppConfig,
  usePlatformCapabilities,
  usePlatformFeatures,
} from './PlatformContext';

export type { PlatformProviderProps } from './PlatformContext';

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
} from './types';
