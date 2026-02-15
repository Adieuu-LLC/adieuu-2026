import { createContext, useContext, type ReactNode } from 'react';
import type { AppConfig, PlatformCapabilities, PlatformContextValue } from './types';

// ============================================================================
// Context
// ============================================================================

const PlatformContext = createContext<PlatformContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the full platform context (config + capabilities).
 * Must be used within a PlatformProvider.
 */
export function usePlatformContext(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatformContext must be used within a PlatformProvider');
  }
  return ctx;
}

/**
 * Access just the app configuration.
 */
export function useAppConfig(): AppConfig {
  const ctx = usePlatformContext();
  return {
    apiBaseUrl: ctx.apiBaseUrl,
    externalLinkBase: ctx.externalLinkBase,
    platform: ctx.platform,
  };
}

/**
 * Access platform capabilities (storage, file system, notifications).
 */
export function usePlatformCapabilities(): PlatformCapabilities {
  const ctx = usePlatformContext();
  return ctx.capabilities;
}

/**
 * Access just the platform feature flags.
 */
export function usePlatformFeatures() {
  const ctx = usePlatformContext();
  return ctx.capabilities.features;
}

// ============================================================================
// Provider
// ============================================================================

export interface PlatformProviderProps {
  /** App configuration (API URL, platform, etc.) */
  config: AppConfig;
  /** Platform-specific capability implementations */
  capabilities: PlatformCapabilities;
  children: ReactNode;
}

/**
 * Provider component that supplies platform configuration and capabilities
 * to the entire app. Each platform (web, desktop, mobile) provides its own
 * implementation of capabilities.
 *
 * @example
 * ```tsx
 * // In apps/web/src/main.tsx
 * <PlatformProvider config={webConfig} capabilities={webCapabilities}>
 *   <App />
 * </PlatformProvider>
 *
 * // In apps/desktop/src/renderer/main.tsx
 * <PlatformProvider config={desktopConfig} capabilities={desktopCapabilities}>
 *   <App />
 * </PlatformProvider>
 * ```
 */
export function PlatformProvider({
  config,
  capabilities,
  children,
}: PlatformProviderProps) {
  const value: PlatformContextValue = {
    ...config,
    capabilities,
  };

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}
