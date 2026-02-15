// ============================================================================
// Platform Configuration Types
// ============================================================================

/**
 * Core app configuration that varies by platform.
 */
export interface AppConfig {
  /** Base URL for API calls. Empty string for same-origin (web), full URL for desktop */
  apiBaseUrl: string;
  /** Base URL for external links like Terms/Privacy. Empty for relative (web), full URL for desktop */
  externalLinkBase: string;
  /** Current platform identifier */
  platform: 'web' | 'desktop' | 'mobile';
}

// ============================================================================
// Platform Capabilities Interfaces
// ============================================================================

/**
 * Secure storage for encryption keys.
 * Desktop uses OS keychain, web uses IndexedDB (less secure).
 */
export interface SecureStorage {
  /** Get a key by ID, returns null if not found */
  getKey(keyId: string): Promise<Uint8Array | null>;
  /** Store a key with the given ID */
  setKey(keyId: string, key: Uint8Array): Promise<void>;
  /** Delete a key by ID */
  deleteKey(keyId: string): Promise<void>;
  /** Check if a key exists */
  hasKey(keyId: string): Promise<boolean>;
}

/**
 * File system access for attachments, exports, backups.
 * Desktop has full access, web has limited browser APIs.
 */
export interface FileSystem {
  /** Pick a file using native dialog - returns null if cancelled */
  pickFile(options?: { accept?: string[] }): Promise<{ name: string; data: Uint8Array } | null>;
  /** Save data to a file using native dialog - returns true if saved */
  saveFile(data: Uint8Array, suggestedName: string): Promise<boolean>;
  /** Read from app-local storage directory (desktop only) */
  readLocalFile(path: string): Promise<Uint8Array | null>;
  /** Write to app-local storage directory (desktop only) */
  writeLocalFile(path: string, data: Uint8Array): Promise<void>;
  /** Delete from app-local storage directory (desktop only) */
  deleteLocalFile(path: string): Promise<boolean>;
  /** List files in app-local storage directory (desktop only) */
  listLocalFiles(path: string): Promise<string[]>;
}

/**
 * Native OS notifications.
 */
export interface Notifications {
  /** Request permission to show notifications */
  requestPermission(): Promise<boolean>;
  /** Check if notifications are permitted */
  hasPermission(): boolean;
  /** Show a notification */
  show(title: string, body: string, options?: { onClick?: () => void }): void;
}

/**
 * Platform feature flags indicating what's available.
 */
export interface PlatformFeatures {
  /** True if secure OS keychain storage is available */
  hasSecureStorage: boolean;
  /** True if local file system access is available */
  hasLocalFileSystem: boolean;
  /** True if system tray integration is available */
  hasSystemTray: boolean;
  /** True if biometric authentication is available */
  hasBiometrics: boolean;
  /** True if native window controls are available */
  hasNativeWindowControls: boolean;
  /** True if deep linking is supported */
  hasDeepLinking: boolean;
}

/**
 * Combined platform capabilities interface.
 * Each platform provides its own implementation.
 */
export interface PlatformCapabilities {
  secureStorage: SecureStorage;
  fileSystem: FileSystem;
  notifications: Notifications;
  features: PlatformFeatures;
}

// ============================================================================
// Context Value
// ============================================================================

/**
 * Full platform context including config and capabilities.
 */
export interface PlatformContextValue extends AppConfig {
  capabilities: PlatformCapabilities;
}
