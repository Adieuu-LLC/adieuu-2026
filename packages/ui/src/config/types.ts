// ============================================================================
// Platform Configuration Types
// ============================================================================

/**
 * Core app configuration that varies by platform.
 */
export interface AppConfig {
  /** Base URL for API calls. Empty string for same-origin (web), full URL for desktop */
  apiBaseUrl: string;
  /** WebSocket URL for chat service. ws:// or wss:// */
  chatWsUrl: string;
  /** Base URL for external links like Terms/Privacy. Empty for relative (web), full URL for desktop */
  externalLinkBase: string;
  /** Current platform identifier */
  platform: 'web' | 'desktop' | 'mobile';
  /** LiveKit server WebSocket URL (e.g. ws://localhost:7880). Omit if LiveKit is not configured. */
  livekitUrl?: string;
  /** FriendlyCaptcha sitekey for free-tier captcha verification. Omit to disable captcha UI. */
  friendlyCaptchaSitekey?: string;
}

// ============================================================================
// Platform Capabilities Interfaces
// ============================================================================

/**
 * Storage health status returned by getStorageStatus.
 * Used by the UI to surface warnings when key protection is degraded.
 */
export interface StorageStatus {
  /** Whether the OS keychain / TEE is available */
  teeAvailable: boolean;
  /** Whether a TEE operation failed at runtime (encrypt/decrypt) */
  teeFailed: boolean;
  /** Human-readable error message, or null if no error */
  lastError: string | null;
}

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
  /** List key IDs matching a prefix. Used for cross-identity operations on desktop. */
  listKeys?(prefix: string): Promise<string[]>;
  /** Query storage health. Returns null on platforms without TEE support (e.g. web). */
  getStorageStatus?(): Promise<StorageStatus | null>;
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
 * Optional audio helpers for notification sounds (desktop: native file dialog + read from path).
 * Web omits this; built-in sounds use static URLs only.
 */
export interface AudioCapabilities {
  /** Open a native file picker for an audio file; returns absolute path (never uploaded). */
  pickSoundFile(): Promise<{ name: string; path: string } | null>;
  /** Read bytes from an absolute path on disk (validated in main process). */
  loadSoundFromPath(path: string): Promise<ArrayBuffer | null>;
}

/**
 * Native OS notifications (Web Notification API in browser/Electron renderer).
 */
export interface Notifications {
  /** Request permission to show notifications */
  requestPermission(): Promise<boolean>;
  /** Check if notifications are permitted */
  hasPermission(): boolean;
  /** Current browser/OS permission state (unsupported platforms report `denied`) */
  getPermissionState(): NotificationPermission;
  /**
   * Show a notification. Prefer `tag` to replace/update an existing notification
   * for the same conversation.
   */
  show(title: string, body: string, options?: { onClick?: () => void; tag?: string }): void;
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
  /** True if the user can pick a custom notification sound from disk (desktop only) */
  hasCustomSoundPicker: boolean;
}

/**
 * Bridge for performing WebAuthn ceremonies from a context with a matching
 * origin (e.g. a hidden BrowserWindow on `https://app.adieuu.com` when the
 * desktop renderer loads from a custom protocol scheme).
 *
 * Only present on platforms where the document origin cannot satisfy the
 * WebAuthn RP ID check directly.
 */
export interface WebAuthnBridge {
  /** Perform `navigator.credentials.create` and return a RegistrationResponseJSON-shaped result. */
  create(options: unknown): Promise<unknown>;
  /** Perform `navigator.credentials.get` and return an AuthenticationResponseJSON-shaped result. */
  get(options: unknown): Promise<unknown>;
}

/**
 * Close behavior preference for the desktop app (minimize to tray vs quit).
 */
export type CloseBehavior = 'close' | 'minimize-to-tray';

export interface ClosePreferences {
  behavior: CloseBehavior;
  hasBeenAsked: boolean;
}

/**
 * Window-level operations exposed by the desktop shell (Electron).
 * Not present on web or mobile.
 */
export interface AppWindowCapabilities {
  /** Update the OS taskbar badge / dock count with the given unread total.
   *  An optional accent colour hex (e.g. "#22d3ee") tints the badge pill.
   *  An optional secondary colour hex tints the tray unread dot. */
  setBadgeCount(count: number, accentColorHex?: string, secondaryColorHex?: string): void;
  /** Enter or exit OS-level fullscreen (desktop Electron only). */
  setFullScreen?: (fullScreen: boolean) => Promise<void>;
  /** Whether the host window is in OS-level fullscreen. */
  isFullScreen?: () => Promise<boolean>;
  /** Read the current close-behavior preference (desktop only). */
  getClosePreferences?: () => Promise<ClosePreferences>;
  /** Update the close-behavior preference (desktop only). */
  setClosePreferences?: (prefs: Partial<ClosePreferences>) => Promise<void>;
}

/**
 * Combined platform capabilities interface.
 * Each platform provides its own implementation.
 */
export interface PlatformCapabilities {
  secureStorage: SecureStorage;
  fileSystem: FileSystem;
  notifications: Notifications;
  /**
   * Open a URL in the system default browser (e.g. Stripe Checkout).
   * Desktop implements via Electron `shell.openExternal` (https only).
   * Web typically omits this; callers fall back to same-tab navigation.
   */
  openExternal?: (url: string) => Promise<void>;
  /** Present when native sound file pick/load is available (Electron). */
  audio?: AudioCapabilities;
  /** Present when WebAuthn must be delegated to a different origin context (packaged desktop). */
  webauthn?: WebAuthnBridge;
  /** Present on desktop — exposes window-level OS integrations. */
  appWindow?: AppWindowCapabilities;
  /**
   * Exit the host application process (desktop). Web may implement best-effort `window.close()`.
   */
  exitApplication?: () => Promise<void>;
  /**
   * Desktop only: delete persisted secure key material under the app user data directory.
   * Optional; omitted on web (IndexedDB wipe covers browser storage).
   */
  wipeLocalSecureKeyFiles?: () => Promise<void>;
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
